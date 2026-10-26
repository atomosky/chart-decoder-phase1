"""Refresh content/terms-fallback.js from content/terms.csv.

Run from the project folder after you update terms.csv:
    python tools/sync_fallback.py
"""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
csv_text = (root / "content" / "terms.csv").read_text(encoding="utf-8-sig")
header = (
    "/* Backup copy of content/terms.csv, used only when the CSV can't be loaded\n"
    "   (for example, opening index.html straight from disk). Run tools/sync_fallback.py\n"
    "   after updating terms.csv to refresh it. */\n"
)
(root / "content" / "terms-fallback.js").write_text(
    header + "window.FALLBACK_TERMS_CSV = " + json.dumps(csv_text) + ";\n", encoding="utf-8"
)
rows = max(0, len([l for l in csv_text.splitlines() if l.strip()]) - 1)
print(f"Updated terms-fallback.js ({rows} lines of terms)")
