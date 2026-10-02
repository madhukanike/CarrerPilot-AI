from io import BytesIO

from docx import Document
from pypdf import PdfReader


def extract_resume_text(file_bytes: bytes, filename: str) -> str:
    """Extract text from a PDF or DOCX resume."""

    extension = filename.lower().split(".")[-1]

    if extension == "pdf":
        reader = PdfReader(BytesIO(file_bytes))

        text = "\n".join(
            page.extract_text() or ""
            for page in reader.pages
        )

        return text.strip()

    if extension == "docx":
        document = Document(BytesIO(file_bytes))

        text = "\n".join(
            paragraph.text
            for paragraph in document.paragraphs
        )

        return text.strip()

    raise ValueError("Only PDF and DOCX files are supported.")