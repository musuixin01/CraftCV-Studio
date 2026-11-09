"""Read-only PDF preflight for CraftCV ATS text exports.

Optional local QA dependency: PyMuPDF (fitz).
Usage: py -3.12 tests/verify_ats_pdf.py --require-chinese --expect "项目经历" file.pdf
Prints measurements only, never the resume's text or personal details.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


def inspect(path: Path, require_chinese: bool, expected: list[str],
            expected_fonts: list[str] | None = None,
            require_embedded_fonts: bool = False,
            max_intermediate_blank_mm: float | None = None) -> tuple[dict, list[str]]:
    try:
        import fitz
    except ImportError as exc:
        raise RuntimeError("缺少可选 QA 依赖 PyMuPDF，请在隔离环境安装后重试") from exc

    issues: list[str] = []
    pages: list[dict] = []
    used_fonts: dict[str, bool] = {}
    full_text: list[str] = []
    if max_intermediate_blank_mm is not None and not 0 <= max_intermediate_blank_mm <= 273:
        raise ValueError('非末页留白阈值必须在 0–273mm 之间')
    with fitz.open(path) as document:
        if document.is_encrypted:
            raise RuntimeError("PDF 已加密，无法检查文字层")
        if len(document) == 0:
            raise RuntimeError("PDF 没有页面")
        for index, page in enumerate(document, start=1):
            for font_entry in page.get_fonts(full=True):
                xref, _ext, _kind, basefont = font_entry[:4]
                if not basefont or basefont in used_fonts:
                    continue
                try:
                    embedded_data = document.extract_font(xref)[-1]
                    used_fonts[basefont] = isinstance(embedded_data, bytes) and bool(embedded_data)
                except (ValueError, RuntimeError):
                    used_fonts[basefont] = False
            text = page.get_text(sort=False)
            words = page.get_text("words")
            full_text.append(text)
            chars = len(text.strip())
            cjk_chars = len(re.findall(r"[\u4e00-\u9fff]", text))
            replacements = text.count("\ufffd")
            width_mm = page.rect.width * 25.4 / 72
            height_mm = page.rect.height * 25.4 / 72
            # This measures the last selectable word relative to the known
            # 12mm ATS print bottom margin, not any decorative background.
            last_word_y = max((word[3] for word in words), default=0)
            blank_bottom_mm = max(0.0, (page.rect.height - 12 * 72 / 25.4 - last_word_y) * 25.4 / 72)
            if (max_intermediate_blank_mm is not None and index < len(document)
                    and blank_bottom_mm > max_intermediate_blank_mm):
                issues.append(f'第 {index} 页底部有约 {blank_bottom_mm:.1f}mm 未使用区域，超出打印留白阈值')
            outside = sum(
                1 for word in words
                if word[0] < -1 or word[1] < -1
                or word[2] > page.rect.width + 1
                or word[3] > page.rect.height + 1
            )
            if abs(width_mm - 210) > 1 or abs(height_mm - 297) > 1:
                issues.append(f"第 {index} 页不是 A4")
            if chars == 0:
                issues.append(f"第 {index} 页无可提取文本，可能为空白页或图片式 PDF")
            if replacements:
                issues.append(f"第 {index} 页有 {replacements} 个乱码替换字符")
            if outside:
                issues.append(f"第 {index} 页有 {outside} 个文字块超出页面边界")
            pages.append({
                "page": index, "width_mm": round(width_mm, 1),
                "height_mm": round(height_mm, 1), "text_chars": chars,
                "han_chars": cjk_chars, "replacement_chars": replacements,
                "words_outside_page": outside,
                "blank_before_bottom_margin_mm": round(blank_bottom_mm, 1),
            })
    for font_name in expected_fonts or []:
        if not any(font_name.casefold() in found.casefold() for found in used_fonts):
            issues.append(f"缺少预期字体：{font_name}")
    if require_embedded_fonts:
        for font_name, embedded in used_fonts.items():
            if not embedded:
                issues.append(f"PDF 字体未嵌入：{font_name}")
    text = "\n".join(full_text)
    if require_chinese and not re.search(r"[\u4e00-\u9fff]", text):
        issues.append("未提取到中文字符")
    for term in expected:
        if term not in text:
            issues.append("缺少一项指定的预期文字；具体内容不会输出")
    if len(pages) > 1 and pages[-1]["text_chars"] < 80:
        issues.append("最后一页文字不足 80 字符，请检查是否出现孤行或多余尾页")
    return {"format": "A4 ATS text PDF", "pages": pages,
            "fonts": [{"name": name, "embedded": embedded}
                      for name, embedded in sorted(used_fonts.items())],
            "passed": not issues}, issues


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify an actual ATS PDF without printing resume text.")
    parser.add_argument("pdf", type=Path, help="Path to a real browser-generated PDF")
    parser.add_argument("--require-chinese", action="store_true")
    parser.add_argument("--expect", action="append", default=[], help="Expected text (never echoed)")
    parser.add_argument("--expect-font", action="append", default=[], help="Expected installed/subset font family")
    parser.add_argument("--require-embedded-fonts", action="store_true", help="Require all used PDF fonts embedded")
    parser.add_argument("--max-intermediate-blank-mm", type=float, default=None,
                        help="Warn/fail if any non-final page has over N mm unused before its 12mm bottom margin")
    args = parser.parse_args()

    if not args.pdf.is_file():
        print("PDF file does not exist", file=sys.stderr)
        return 2
    try:
        report, issues = inspect(args.pdf, args.require_chinese, args.expect,
                                 args.expect_font, args.require_embedded_fonts,
                                 args.max_intermediate_blank_mm)
    except Exception as exc:
        print(f"PDF inspection failed: {exc}", file=sys.stderr)
        return 2

    report["issues"] = issues
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not issues else 1


if __name__ == "__main__":
    raise SystemExit(main())
