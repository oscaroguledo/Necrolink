"""
Generate PDF fixtures for the PDF link extractor tests.

Usage (from the repo root):
    python3 tests/fixtures/generate-pdfs.py

Requires: reportlab (pip install reportlab)
Produces:
    tests/fixtures/sample.pdf     - 3 pages: link annotations, plain-text URLs,
                                    a citation with a date, a URL with trailing
                                    punctuation, a mailto link, a page with no links
    tests/fixtures/encrypted.pdf  - password-protected PDF (should be rejected)
    tests/fixtures/corrupt.pdf    - not a real PDF (should be rejected)
"""

from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.lib.pdfencrypt import StandardEncryption
from reportlab.pdfgen import canvas

HERE = Path(__file__).parent
FONT = "Helvetica"
SIZE = 11


def link_text(c: canvas.Canvas, x: float, y: float, text: str, url: str) -> None:
    """Draw text and put a clickable URI annotation exactly over it."""
    c.drawString(x, y, text)
    width = c.stringWidth(text, FONT, SIZE)
    c.linkURL(url, (x, y - 2, x + width, y + SIZE), relative=0, thickness=0)


def build_sample() -> None:
    c = canvas.Canvas(str(HERE / "sample.pdf"), pagesize=letter)
    c.setFont(FONT, SIZE)

    # Page 1: annotation links (anchor text differs from URL) + one plain-text URL
    c.drawString(72, 720, "Necrolink PDF fixture - page 1")
    c.drawString(72, 690, "Read")
    link_text(c, 72 + c.stringWidth("Read ", FONT, SIZE), 690,
              "the Internet Archive", "https://archive.org/web/")
    c.drawString(72, 670, "Tracking params should be removed:")
    link_text(c, 72, 655, "tracked link",
              "https://example.com/page?utm_source=pdf&page=2")
    c.drawString(72, 625, "Plain text URL: https://plain.example.com/article for details.")
    link_text(c, 72, 595, "Email the author", "mailto:author@example.com")
    c.showPage()

    # Page 2: citation with a retrieval date, URL with trailing punctuation,
    # and a URL that is both visible text AND an annotation (must not duplicate)
    c.setFont(FONT, SIZE)
    c.drawString(72, 720, "Smith, J. (2023). Link Rot in Academic Publications.")
    c.drawString(72, 705, "https://journal.example.org/articles/link-rot. Retrieved 2023-06-15.")
    c.drawString(72, 675, "See (https://paren.example.com/page) and www.bare.example.com/docs, too.")
    link_text(c, 72, 645, "https://both.example.com/doc", "https://both.example.com/doc")
    c.showPage()

    # Page 3: no links at all
    c.setFont(FONT, SIZE)
    c.drawString(72, 720, "This page intentionally has no links.")
    c.showPage()

    c.save()


def build_encrypted() -> None:
    enc = StandardEncryption("secret", ownerPassword="owner-secret", canPrint=0)
    c = canvas.Canvas(str(HERE / "encrypted.pdf"), pagesize=letter, encrypt=enc)
    c.setFont(FONT, SIZE)
    c.drawString(72, 720, "Secret: https://hidden.example.com")
    c.showPage()
    c.save()


def build_corrupt() -> None:
    (HERE / "corrupt.pdf").write_bytes(b"%PDF-1.4\nthis is not really a pdf\n%%EOF\n")


if __name__ == "__main__":
    build_sample()
    build_encrypted()
    build_corrupt()
    print("Wrote sample.pdf, encrypted.pdf, corrupt.pdf to", HERE)
