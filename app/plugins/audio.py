from __future__ import annotations

import os
import io
import tempfile
import logging
import numpy as np
from flask import Blueprint, jsonify, request, current_app, send_file
import numpy as np


audio_bp = Blueprint("audio", __name__)
logger = logging.getLogger(__name__)

# --------------------
# Kokoro TTS (lazy init)
# --------------------

AVAILABLE_VOICES = {
    'en-US-Neural2-F': {'lang': 'en-US', 'voice': 'af_heart', 'description': 'US Female - Heart'},
    'en-US-Neural2-M': {'lang': 'en-US', 'voice': 'am_full', 'description': 'US Male - Full'},
    'en-GB-Neural2-F': {'lang': 'en-GB', 'voice': 'bf_gentle', 'description': 'UK Female - Gentle'},
    'en-GB-Neural2-M': {'lang': 'en-GB', 'voice': 'bm_full', 'description': 'UK Male - Full'}
}


def _get_tts_pipelines():
    pipelines = getattr(current_app, "tts_pipelines", None)
    if pipelines:
        return pipelines
    try:
        from kokoro import KPipeline  # type: ignore
    except Exception as e:
        logger.warning(f"Kokoro not available: {e}")
        return None
    try:
        pipelines = {
            'en-US': KPipeline(lang_code='a'),  # American English
            'en-GB': KPipeline(lang_code='b'),  # British English
        }
        current_app.tts_pipelines = pipelines  # type: ignore[attr-defined]
        return pipelines
    except Exception as e:
        logger.error(f"Failed to init Kokoro pipelines: {e}")
        return None


def _get_whisper_model():
    wm = getattr(current_app, "whisper_model", None)
    if wm is not None:
        return wm
    try:
        import whisper  # type: ignore
        model_name = os.getenv("WHISPER_MODEL", "medium")
        return whisper.load_model(model_name)
    except Exception as e:
        logger.error(f"Whisper model not available: {e}")
        return None


def _preprocess_audio_for_whisper(audio_path: str) -> str | None:
    try:
        from pydub import AudioSegment  # type: ignore
        import librosa  # type: ignore
        import soundfile as sf  # type: ignore
    except Exception as e:
        # Basic path passthrough if libs not available
        return audio_path

    try:
        audio = AudioSegment.from_file(audio_path)
        if len(audio) < 500:
            return None
        if audio.channels > 1:
            audio = audio.set_channels(1)
        audio = audio.normalize()
        if audio.frame_rate != 16000:
            audio = audio.set_frame_rate(16000)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_wav:
            temp_wav_path = temp_wav.name
        audio.export(temp_wav_path, format="wav")
        try:
            y, sr = librosa.load(temp_wav_path, sr=16000)
            if len(y) > 0:
                y_trimmed, _ = librosa.effects.trim(y, top_db=30)
                if len(y_trimmed) > 0.5 * sr:
                    y_norm = librosa.util.normalize(y_trimmed)
                    stft = librosa.stft(y_norm)
                    mag = np.abs(stft)
                    noise_threshold = np.percentile(mag, 20)
                    mag_gated = np.where(mag > noise_threshold, mag, mag * 0.1)
                    phase = np.angle(stft)
                    stft_clean = mag_gated * np.exp(1j * phase)
                    y_clean = librosa.istft(stft_clean)
                    y_final = librosa.util.normalize(y_clean)
                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as processed_file:
                        processed_path = processed_file.name
                    sf.write(processed_path, y_final, sr)
                    os.unlink(temp_wav_path)
                    return processed_path
                else:
                    os.unlink(temp_wav_path)
                    return None
            else:
                os.unlink(temp_wav_path)
                return None
        except Exception:
            os.unlink(temp_wav_path)
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as processed_file:
                processed_path = processed_file.name
            audio.export(processed_path, format="wav")
            return processed_path
    except Exception as e:
        logger.error(f"Error preprocessing audio: {e}")
        return audio_path


@audio_bp.post("/transcribe")
def transcribe_audio():
    try:
        if request.content_type == "application/json":
            data = request.get_json() or {}
            if data.get("type") == "url":
                return _transcribe_from_url(data.get("url"))
        file_param_name = "file" if "file" in request.files else "audio"
        if file_param_name not in request.files:
            return jsonify({"success": False, "error": "No audio file provided"}), 400
        audio_file = request.files[file_param_name]
        model = _get_whisper_model()
        if not model:
            return jsonify({"success": False, "error": "Whisper model not available"}), 500
        if audio_file.filename == "":
            return jsonify({"success": False, "error": "No audio file selected"}), 400
        return _transcribe_file_content(audio_file)
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        return jsonify({"success": False, "error": f"Transcription failed: {str(e)}"}), 500


@audio_bp.get("/tts/voices")
def tts_voices():
    pipelines = _get_tts_pipelines()
    if not pipelines:
        return jsonify({"error": "Kokoro TTS not available"}), 501
    voices_list = [
        {"id": vid, "name": details["description"], "language": details["lang"]}
        for vid, details in AVAILABLE_VOICES.items()
    ]
    return jsonify({"voices": voices_list})


@audio_bp.post("/tts/generate")
def tts_generate():
    pipelines = _get_tts_pipelines()
    if not pipelines:
        return jsonify({"error": "Kokoro TTS not available"}), 501
    try:
        import soundfile as sf  # type: ignore
    except Exception:
        return jsonify({"error": "soundfile not installed"}), 500

    data = request.get_json() or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "No text provided"}), 400
    voice_id = data.get("voice", "en-US-Neural2-F")
    speed = float(data.get("rate", 1.0))
    if voice_id not in AVAILABLE_VOICES:
        voice_id = next(iter(AVAILABLE_VOICES.keys()))
    v = AVAILABLE_VOICES[voice_id]
    lang = v["lang"]
    voice_name = v["voice"]
    if lang not in pipelines:
        return jsonify({"error": f"Language {lang} not supported"}), 400
    pipeline = pipelines[lang]
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            audio_path = tmp.name
        full_audio = np.array([])
        generator = pipeline(text, voice=voice_name, speed=speed, split_pattern=r"[.!?;:]\s+")
        for _, _, audio_chunk in generator:
            if len(audio_chunk) > 0:
                if len(full_audio) == 0:
                    full_audio = audio_chunk
                else:
                    pause = np.zeros(int(24000 * 0.3))
                    full_audio = np.concatenate((full_audio, pause, audio_chunk))
        if len(full_audio) == 0:
            full_audio = np.zeros(1000)
        sf.write(audio_path, full_audio, 24000)
        return send_file(audio_path, mimetype="audio/wav", as_attachment=True, download_name="speech.wav")
    except Exception as e:
        logger.error(f"TTS generation error: {e}")
        return jsonify({"error": str(e)}), 500


def _transcribe_from_url(url: str):
    if not url:
        return jsonify({"success": False, "error": "No URL provided"}), 400
    try:
        import yt_dlp  # type: ignore
    except ImportError:
        return jsonify({"success": False, "error": "yt-dlp not installed. Please install with: pip install yt-dlp"}), 500
    if not _is_supported_url(url):
        return jsonify({"success": False, "error": "URL must be from YouTube or Instagram"}), 400
    temp_file_path = None
    try:
        ydl_opts = {
            "format": "bestaudio/best",
            "extractaudio": True,
            "audioformat": "mp3",
            "outtmpl": tempfile.gettempdir() + "/%(title)s.%(ext)s",
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            title = info.get("title", "Unknown")
            ydl.download([url])
            download_path = ydl.prepare_filename(info)
            for ext in [".mp3", ".m4a", ".webm", ".ogg"]:
                potential_path = download_path.rsplit(".", 1)[0] + ext
                if os.path.exists(potential_path):
                    temp_file_path = potential_path
                    break
            if not temp_file_path or not os.path.exists(temp_file_path):
                return jsonify({"success": False, "error": "Failed to download audio from URL"}), 400
        result = _transcribe_audio_file(temp_file_path)
        if result.get("success"):
            result["source_title"] = title
        return jsonify(result)
    except Exception as e:
        logger.error(f"URL transcription error: {e}")
        return jsonify({"success": False, "error": f"Failed to process URL: {str(e)}"}), 500
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except Exception:
                pass


def _transcribe_file_content(audio_file):
    file_extension = ".webm"
    if audio_file.content_type:
        if "wav" in audio_file.content_type:
            file_extension = ".wav"
        elif "mp3" in audio_file.content_type:
            file_extension = ".mp3"
        elif "ogg" in audio_file.content_type:
            file_extension = ".ogg"
        elif "m4a" in audio_file.content_type:
            file_extension = ".m4a"
    with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as temp_file:
        temp_file_path = temp_file.name
        audio_file.save(temp_file_path)
    try:
        result = _transcribe_audio_file(temp_file_path)
        return jsonify(result)
    finally:
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)


def _transcribe_audio_file(file_path: str):
    model = _get_whisper_model()
    if not model:
        return {"success": False, "error": "Whisper model not available"}
    processed_audio_path = _preprocess_audio_for_whisper(file_path)
    transcription_path = processed_audio_path if processed_audio_path != file_path else file_path
    try:
        import whisper  # type: ignore
        audio_array = whisper.load_audio(transcription_path)
        audio_array = whisper.pad_or_trim(audio_array)
        mel = whisper.log_mel_spectrogram(audio_array).to(model.device)
        _, lang_probs = model.detect_language(mel)
        detected_language, detected_prob = max(lang_probs.items(), key=lambda x: x[1])
        whisper_language = detected_language if detected_prob >= 0.70 else None
    except Exception as e_lang:
        logger.warning(f"Language detection failed: {e_lang}. Falling back to auto.")
        whisper_language = None
        detected_language = "unknown"

    try:
        result = model.transcribe(
            transcription_path,
            language=whisper_language,
            task="transcribe",
            verbose=False,
            temperature=[0.0, 0.2],
            beam_size=5,
            best_of=5,
            patience=1.0,
            condition_on_previous_text=False,
            compression_ratio_threshold=2.4,
            logprob_threshold=-1.0,
            no_speech_threshold=0.4,
        )
    except Exception:
        result = model.transcribe(
            transcription_path,
            language=None,
            task="transcribe",
            verbose=False,
            temperature=[0.0, 0.2],
            beam_size=5,
            best_of=5,
            patience=1.0,
            condition_on_previous_text=False,
            compression_ratio_threshold=2.4,
            logprob_threshold=-1.0,
            no_speech_threshold=0.4,
        )

    transcribed_text = result.get("text", "").strip()
    detected_language = result.get("language", locals().get("detected_language", "unknown"))
    segments = result.get("segments", [])
    avg_confidence = 0.0
    if segments:
        confidences = [s.get("avg_logprob", 0.0) for s in segments]
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
    if processed_audio_path and processed_audio_path != file_path:
        try:
            os.unlink(processed_audio_path)
        except Exception:
            pass
    if not transcribed_text:
        return {"success": False, "error": "No speech detected in audio. Please try speaking more clearly and ensure good microphone placement."}
    return {"success": True, "transcription": transcribed_text, "language": detected_language, "confidence": avg_confidence}


def _is_supported_url(url: str) -> bool:
    try:
        from urllib.parse import urlparse
        domain = urlparse(url).netloc.lower()
        if any(domain.endswith(d) for d in ["youtube.com", "youtu.be", "m.youtube.com"]):
            return True
        if any(domain.endswith(d) for d in ["instagram.com", "m.instagram.com"]):
            return True
        return False
    except Exception:
        return False
