import pyaudio
import wave

class AudioRecorder:
    def __init__(self, sample_rate=16000, chunk_size=4096):
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size
        self.audio = pyaudio.PyAudio()
        self.stream = None
        self.is_recording = False
        self.audio_buffer = []

    def start_recording(self):
        self.is_recording = True
        self.audio_buffer = []  # Reiniciar el buffer
        self.stream = self.audio.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=self.sample_rate,
            input=True,
            frames_per_buffer=self.chunk_size,
            stream_callback=self.callback
        )
        self.stream.start_stream()
        print("Grabación iniciada...")

    def callback(self, in_data, frame_count, time_info, status):
        if self.is_recording:
            self.audio_buffer.append(in_data)
        return (in_data, pyaudio.paContinue)

    def stop_recording(self):
        self.is_recording = False
        if self.stream:
            self.stream.stop_stream()
            self.stream.close()
        print("Grabación detenida.")
        return b''.join(self.audio_buffer)

    def save_to_file(self, filename="temp_audio.wav"):
        with wave.open(filename, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(self.audio.get_sample_size(pyaudio.paInt16))
            wf.setframerate(self.sample_rate)
            wf.writeframes(b''.join(self.audio_buffer))
        print(f"Audio guardado en {filename}")