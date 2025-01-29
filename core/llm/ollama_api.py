import requests
from typing import Optional

class OllamaHandler:
    def __init__(self, base_url="http://localhost:11434", default_model="mistral"):
        self.base_url = base_url
        self.default_model = default_model

    def generate_response(self, prompt: str, model: Optional[str] = None) -> str:
        model = model or self.default_model
        try:
            response = requests.post(
                f"{self.base_url}/api/generate",
                json={"model": model, "prompt": prompt, "stream": False}
            )
            return response.json().get("response", "Error processing response")
        except requests.exceptions.ConnectionError:
            return "Ollama server not running"