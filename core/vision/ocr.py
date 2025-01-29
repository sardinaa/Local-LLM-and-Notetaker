import cv2
import pytesseract
from PIL import Image

class ImageOCR:
    def __init__(self, languages=["eng", "spa"]):
        self.languages = "+".join(languages)
        
    def preprocess_image(self, image_path: str):
        img = cv2.imread(image_path)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)
        return thresh

    def extract_text(self, image_path: str) -> str:
        processed = self.preprocess_image(image_path)
        return pytesseract.image_to_string(
            Image.fromarray(processed),
            lang=self.languages
        )