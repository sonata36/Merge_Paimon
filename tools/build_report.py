"""从 docs/项目报告.md 生成可提交的 A4 PDF。

运行：python tools/build_report.py
依赖：reportlab、Pillow；字体使用 Windows 自带 Deng.ttf/Dengb.ttf。
"""

from __future__ import annotations

import html
import re
from pathlib import Path

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    LongTable,
    PageTemplate,
    Paragraph,
    Spacer,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "项目报告.md"
OUTPUT = ROOT / "output" / "pdf" / "合成大派蒙_项目报告.pdf"
FONT_DIR = Path("C:/Windows/Fonts")
pdfmetrics.registerFont(TTFont("Deng", str(FONT_DIR / "Deng.ttf")))
pdfmetrics.registerFont(TTFont("DengBold", str(FONT_DIR / "Dengb.ttf")))
pdfmetrics.registerFontFamily("Deng", normal="Deng", bold="DengBold")

GREEN = colors.HexColor("#315e4d")
BODY = colors.HexColor("#344940")
GOLD = colors.HexColor("#c29441")
PALE = colors.HexColor("#e5eee2")
LINE = colors.HexColor("#d8dccd")
PAGE_W, PAGE_H = A4
LEFT = RIGHT = 17 * mm
TOP = 18 * mm
BOTTOM = 18 * mm
CONTENT_W = PAGE_W - LEFT - RIGHT


def style(name: str, size: float, leading: float, *, bold: bool = False,
          color=BODY, before: float = 0, after: float = 0) -> ParagraphStyle:
    return ParagraphStyle(
        name,
        fontName="DengBold" if bold else "Deng",
        fontSize=size,
        leading=leading,
        textColor=color,
        wordWrap="CJK",
        alignment=TA_LEFT,
        spaceBefore=before,
        spaceAfter=after,
        allowWidows=0,
        allowOrphans=0,
    )


STYLES = {
    "title": style("Title", 22, 29, bold=True, color=GREEN, before=8, after=5),
    "subtitle": style("Subtitle", 18, 25, bold=True, color=GREEN, before=0, after=12),
    "h2": style("H2", 13, 19, bold=True, color=GREEN, before=12, after=6),
    "h3": style("H3", 10.5, 16, bold=True, color=GREEN, before=9, after=4),
    "body": style("Body", 9.15, 14.7, after=5),
    "meta": style("Meta", 8.45, 13.8, color=colors.HexColor("#527366"), after=4),
    "table": style("Table", 7.7, 11.8),
    "tablehead": style("TableHead", 7.8, 11.8, bold=True, color=GREEN),
    "caption": style("Caption", 8.2, 12.5, color=colors.HexColor("#58736b"), before=3, after=8),
}


def markup(value: str) -> str:
    result = html.escape(value.strip())
    result = re.sub(r"`([^`]+)`", r'<font color="#996a35">\1</font>', result)
    result = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", result)

    def link(match: re.Match[str]) -> str:
        label, url = match.groups()
        if url.startswith(("https://", "http://")):
            return f'<link href="{url}" color="#8e672c">{label}</link>'
        return label

    return re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link, result)


def make_table(lines: list[str]) -> LongTable:
    rows = [[cell.strip() for cell in line.strip().strip("|").split("|")] for line in lines]
    rows.pop(1)  # Markdown alignment row
    count = len(rows[0])
    fractions = {2: [0.26, 0.74], 3: [0.21, 0.45, 0.34]}.get(count, [1 / count] * count)
    widths = [CONTENT_W * item for item in fractions]
    data = []
    for index, row in enumerate(rows):
        cell_style = STYLES["tablehead"] if index == 0 else STYLES["table"]
        data.append([Paragraph(markup(cell), cell_style) for cell in row])
    table = LongTable(data, colWidths=widths, repeatRows=1, hAlign="LEFT", splitByRow=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PALE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8f6ef")]),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def make_figure(line: str):
    match = re.fullmatch(r"!\[(.*?)\]\((.*?)\)", line)
    if not match:
        return Paragraph(markup(line), STYLES["body"])
    caption, filename = match.groups()
    path = SOURCE.parent / filename
    if not path.exists():
        raise FileNotFoundError(path)
    with PILImage.open(path) as source_image:
        width, height = source_image.size
    scale = min(CONTENT_W / width, 230 / height)
    figure = Image(str(path), width=width * scale, height=height * scale)
    figure.hAlign = "CENTER"
    return KeepTogether([Spacer(1, 5), figure, Paragraph(markup(caption), STYLES["caption"])])


def parse_document() -> list:
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    story = []
    index = 0
    title_count = 0
    while index < len(lines):
        line = lines[index].strip()
        if not line:
            index += 1
            continue
        if line.startswith("| "):
            block = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                block.append(lines[index])
                index += 1
            story.extend([Spacer(1, 4), make_table(block), Spacer(1, 8)])
            continue
        if line.startswith("!["):
            story.append(make_figure(line))
            index += 1
            continue
        if line.startswith("# "):
            title_count += 1
            key = "title" if title_count == 1 else "subtitle"
            story.append(Paragraph(markup(line[2:]), STYLES[key]))
            index += 1
            continue
        if line.startswith("## "):
            story.append(Paragraph(markup(line[3:]), STYLES["h2"]))
            index += 1
            continue
        if line.startswith("### "):
            story.append(Paragraph(markup(line[4:]), STYLES["h3"]))
            index += 1
            continue
        if line.startswith("> "):
            story.append(Paragraph(markup(line[2:]), STYLES["meta"]))
            index += 1
            continue
        if line.startswith("- "):
            story.append(Paragraph("• " + markup(line[2:]), STYLES["body"]))
            index += 1
            continue
        paragraph = [line]
        index += 1
        while index < len(lines) and lines[index].strip() and not lines[index].lstrip().startswith(("#", ">", "|", "![", "- ")):
            paragraph.append(lines[index].strip())
            index += 1
        story.append(Paragraph(markup(" ".join(paragraph)), STYLES["body"]))
    return story


def decorate(canvas, doc) -> None:
    canvas.saveState()
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(0.55)
    canvas.line(LEFT, PAGE_H - 13.2 * mm, PAGE_W - RIGHT, PAGE_H - 13.2 * mm)
    canvas.setFont("Deng", 7.5)
    canvas.setFillColor(colors.HexColor("#698b7f"))
    canvas.drawString(LEFT, PAGE_H - 11.2 * mm, "合成大派蒙 · 面向对象分析与设计")
    canvas.drawRightString(PAGE_W - RIGHT, 10.5 * mm, str(doc.page))
    canvas.restoreState()


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document = BaseDocTemplate(
        str(OUTPUT), pagesize=A4,
        leftMargin=LEFT, rightMargin=RIGHT, topMargin=TOP, bottomMargin=BOTTOM,
        title="《合成大派蒙》面向对象分析与设计项目报告",
        author="合成大派蒙课程项目",
    )
    frame = Frame(LEFT, BOTTOM, CONTENT_W, PAGE_H - TOP - BOTTOM, leftPadding=0,
                  rightPadding=0, topPadding=0, bottomPadding=0)
    document.addPageTemplates(PageTemplate(id="report", frames=[frame], onPage=decorate))
    document.build(parse_document())
    print(OUTPUT)


if __name__ == "__main__":
    main()
