#!/usr/bin/env python3
"""Helpers for extracting vehicle details from listing card text."""
import re
from typing import Optional


_DETAIL_STOP_RE = re.compile(
    r"\b(?:interior|mileage|miles?|mi|stock|vin|engine|transmission|drivetrain|seller|dealer|price|mpg|fuel)\b",
    re.IGNORECASE,
)


def _clean_detail_value(value: str) -> str:
    value = value.strip(" :-\t\r\n")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def extract_exterior_color(text: str) -> Optional[str]:
    """Extract an exterior color from common vehicle listing card labels."""
    if not text:
        return None

    lines = [_clean_detail_value(line) for line in text.splitlines()]
    lines = [line for line in lines if line]

    for index, line in enumerate(lines):
        label_match = re.match(
            r"^(?:exterior(?:\s+color)?|ext\.?\s*color|color)\s*:?\s*(.*)$",
            line,
            re.IGNORECASE,
        )
        if not label_match:
            continue

        value = _clean_detail_value(label_match.group(1))
        if not value and index + 1 < len(lines):
            value = _clean_detail_value(lines[index + 1])

        if value and not _DETAIL_STOP_RE.search(value):
            return value

    inline_match = re.search(
        r"(?:exterior(?:\s+color)?|ext\.?\s*color|color)\s*:?\s*([A-Za-z][A-Za-z0-9 .'-]*(?:Pearl|Metallic|White|Black|Gray|Grey|Silver|Blue|Red|Green|Brown|Gold|Beige|Orange|Yellow))",
        text,
        re.IGNORECASE,
    )
    if inline_match:
        return _clean_detail_value(inline_match.group(1))

    return None
