import whisper

class WhisperTranscriber:
    def __init__(self, model_size="base"):
        self.model = whisper.load_model(model_size)

    def transcribe(self, audio_file: str) -> str:
        try:
            result = self.model.transcribe(audio_file)
            return result["text"]
        except Exception as e:
            print(f"Error en la transcripción: {e}")
            return "Error: No se pudo transcribir el audio."