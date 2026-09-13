"""
Build an APA 7th-edition manuscript from docs/manuscript/manuscript.md.

Implements the formatting APA 7 specifies for a professional paper: title page
with running head, 12-pt Times New Roman, double spacing throughout, 1-in.
margins, half-inch first-line paragraph indents, the five-level heading scheme,
and a hanging-indent reference list. Markdown emphasis (*italic*, **bold**) is
carried through; block quotes are rendered as APA block quotations (half-inch
indent, no quotation marks).

    python3 docs/manuscript/build_docx.py
"""
from __future__ import annotations

import re
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt

SRC = Path("docs/manuscript/manuscript.md")
OUT = Path("docs/manuscript/Cox_transition_operators_manuscript.docx")
FONT, SIZE = "Times New Roman", Pt(12)


def base(doc: Document) -> None:
    st = doc.styles["Normal"]
    st.font.name = FONT
    st.font.size = SIZE
    st.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    pf = st.paragraph_format
    pf.line_spacing_rule = WD_LINE_SPACING.DOUBLE
    pf.space_after = Pt(0)
    pf.space_before = Pt(0)
    for s in doc.sections:
        s.top_margin = s.bottom_margin = Inches(1)
        s.left_margin = s.right_margin = Inches(1)


def page_number(par) -> None:
    run = par.add_run()
    for instr in ("begin", "text", "end"):
        el = OxmlElement(f"w:fld{'Char' if instr != 'text' else ''}")
        if instr == "text":
            el = OxmlElement("w:instrText")
            el.set(qn("xml:space"), "preserve")
            el.text = " PAGE "
        else:
            el.set(qn("w:fldCharType"), instr)
        run._r.append(el)


def running_head(doc: Document, short_title: str) -> None:
    hdr = doc.sections[0].header
    p = hdr.paragraphs[0]
    p.text = short_title.upper()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    tab = p.paragraph_format.tab_stops.add_tab_stop(Inches(6.5))
    p.add_run("\t")
    page_number(p)
    for r in p.runs:
        r.font.name, r.font.size = FONT, SIZE


INLINE = re.compile(r"(\*\*.+?\*\*|\*.+?\*)")


def add_runs(par, text: str) -> None:
    for piece in INLINE.split(text):
        if not piece:
            continue
        if piece.startswith("**") and piece.endswith("**"):
            r = par.add_run(piece[2:-2]); r.bold = True
        elif piece.startswith("*") and piece.endswith("*"):
            r = par.add_run(piece[1:-1]); r.italic = True
        else:
            r = par.add_run(piece)
        r.font.name, r.font.size = FONT, SIZE


def heading(doc: Document, text: str, level: int):
    """APA 7 levels: 1 centered bold; 2 flush-left bold; 3 flush-left bold
    italic. Title case is applied in the source, not here."""
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.DOUBLE
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    if level == 1:
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(text)
    r.bold = True
    r.italic = level >= 3
    r.font.name, r.font.size = FONT, SIZE
    return p


def main() -> None:
    raw = SRC.read_text().split("\n")
    meta = {}
    body = []
    for line in raw:
        m = re.match(r"%%(TITLE|AUTHOR|AFFIL)%%(.*)", line)
        if m:
            meta[m.group(1)] = m.group(2).strip()
        else:
            body.append(line)

    doc = Document()
    base(doc)
    running_head(doc, "TRANSITION OPERATORS AND MULTIPLE CONTROL")

    # ---- title page ----
    for _ in range(4):
        doc.add_paragraph()
    for text, bold in ((meta["TITLE"], True), ("", False), (meta["AUTHOR"], False),
                       (meta["AFFIL"], False)):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.DOUBLE
        r = p.add_run(text)
        r.bold = bold
        r.font.name, r.font.size = FONT, SIZE
    doc.add_page_break()

    in_refs = False
    first_para_after_heading = True
    for line in body:
        s = line.rstrip()
        if not s.strip():
            continue
        if s.startswith("#### "):
            # APA level 4: indented, bold, title case, ends with a period, and
            # the paragraph text continues on the same line.
            head, _, rest = s[5:].partition(". ")
            p = doc.add_paragraph()
            pf = p.paragraph_format
            pf.line_spacing_rule = WD_LINE_SPACING.DOUBLE
            pf.first_line_indent = Inches(0.5)
            r = p.add_run(head + ". ")
            r.bold = True
            r.font.name, r.font.size = FONT, SIZE
            add_runs(p, rest)
            first_para_after_heading = False
            continue
        if s.startswith("### "):
            heading(doc, s[4:], 3); first_para_after_heading = True; continue
        if s.startswith("## "):
            heading(doc, s[3:], 2); first_para_after_heading = True; continue
        if s.startswith("# "):
            txt = s[2:]
            in_refs = txt.strip().lower() == "references"
            heading(doc, txt, 1); first_para_after_heading = True; continue
        if s.startswith("> "):
            p = doc.add_paragraph()
            pf = p.paragraph_format
            pf.left_indent = Inches(0.5)
            pf.line_spacing_rule = WD_LINE_SPACING.DOUBLE
            add_runs(p, s[2:])
            first_para_after_heading = True
            continue

        p = doc.add_paragraph()
        pf = p.paragraph_format
        pf.line_spacing_rule = WD_LINE_SPACING.DOUBLE
        if in_refs:
            pf.left_indent = Inches(0.5)
            pf.first_line_indent = Inches(-0.5)   # hanging indent
        else:
            pf.first_line_indent = Inches(0) if first_para_after_heading else Inches(0.5)
            first_para_after_heading = False
        add_runs(p, s)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
