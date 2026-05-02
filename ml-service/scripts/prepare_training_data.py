"""Prepare bank statement training data.

Scans the project's statement directories, identifies bank formats,
deduplicates by content hash, and organizes into bank-specific subdirectories
ready for the label generator.

Usage:
    python -m scripts.prepare_training_data --output-dir data/raw_statements

Output:
    data/raw_statements/
        westpac/
            westpac-oct-24.pdf
            ...
        cba/
            Statement20251017.pdf
            ...
        anz/
            28148477-44d6-4445-aa06-c3c6b2c461d3.pdf
            ...
"""

import argparse
import hashlib
import os
import shutil
from pathlib import Path

import pdfplumber


# Bank detection from first 2 pages of text
def detect_bank(pdf_path: str) -> str:
    """Detect bank from PDF text content."""
    fname = os.path.basename(pdf_path).lower()

    # Filename-based detection (high confidence)
    if "westpac" in fname or "westpa-" in fname:
        return "westpac"
    if fname.startswith("statement") and not fname.startswith("statement_"):
        # CBA statement naming convention: Statement20251017.pdf
        return "cba"

    # Content-based detection
    try:
        with pdfplumber.open(pdf_path) as pdf:
            text = ""
            for p in pdf.pages[:2]:
                text += p.extract_text() or ""

            if not text.strip():
                return "scanned"

            text_lower = text.lower()
            first_500 = text_lower[:500]

            if "anz" in first_500 or "australia and new zealand banking" in text_lower:
                return "anz"
            if "westpac" in first_500:
                return "westpac"
            if "commonwealth" in first_500 or "netbank" in first_500 or "ultimate awards" in text_lower:
                return "cba"
            if "nab" in first_500 or "national australia bank" in text_lower:
                return "nab"

    except Exception:
        return "unknown"

    return "unknown"


def file_hash(path: str) -> str:
    """SHA-256 hash of file contents."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description="Prepare training data from statement PDFs")
    parser.add_argument(
        "--output-dir",
        default="data/raw_statements",
        help="Output directory organized by bank",
    )
    parser.add_argument(
        "--project-root",
        default=None,
        help="Project root (auto-detected if not specified)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print plan without copying")
    args = parser.parse_args()

    # Auto-detect project root
    project_root = args.project_root
    if not project_root:
        script_dir = Path(__file__).resolve().parent
        project_root = str(script_dir.parent.parent)

    source_dirs = [
        os.path.join(project_root, "web/testdata/statements"),
        os.path.join(project_root, "tax25/statements"),
    ]

    output_dir = os.path.join(
        project_root, "ml-service", args.output_dir
    )

    # Collect all PDFs with bank detection and dedup
    seen_hashes: dict[str, str] = {}  # hash -> first path
    bank_files: dict[str, list[str]] = {}  # bank -> [paths]
    skipped_dupes = 0
    skipped_other = 0

    for src_dir in source_dirs:
        if not os.path.isdir(src_dir):
            print(f"Source dir not found: {src_dir}")
            continue

        for fname in sorted(os.listdir(src_dir)):
            if not fname.endswith(".pdf"):
                continue
            if fname.endswith(".ground-truth.json"):
                continue

            full_path = os.path.join(src_dir, fname)
            fhash = file_hash(full_path)

            if fhash in seen_hashes:
                skipped_dupes += 1
                continue
            seen_hashes[fhash] = full_path

            bank = detect_bank(full_path)
            if bank in ("scanned", "unknown"):
                skipped_other += 1
                print(f"  Skip ({bank}): {fname}")
                continue

            bank_files.setdefault(bank, []).append(full_path)

    # Summary
    print("\n=== Bank Detection Summary ===")
    total_files = 0
    total_pages = 0
    for bank in sorted(bank_files.keys()):
        files = bank_files[bank]
        pages = 0
        for f in files:
            try:
                with pdfplumber.open(f) as pdf:
                    pages += len(pdf.pages)
            except Exception:
                pass
        total_files += len(files)
        total_pages += pages
        print(f"  {bank}: {len(files)} files, {pages} pages")
    print(f"  Total: {total_files} unique files, {total_pages} pages")
    print(f"  Skipped: {skipped_dupes} duplicates, {skipped_other} scanned/unknown")

    if args.dry_run:
        print("\nDry run — no files copied.")
        return

    # Copy to output directory
    print(f"\nCopying to {output_dir}...")
    for bank, files in bank_files.items():
        bank_dir = os.path.join(output_dir, bank)
        os.makedirs(bank_dir, exist_ok=True)

        for src_path in files:
            fname = os.path.basename(src_path)
            dst_path = os.path.join(bank_dir, fname)
            if not os.path.exists(dst_path):
                shutil.copy2(src_path, dst_path)
                print(f"  {bank}/{fname}")

    print("\nDone. Ready for silver label generation:")
    print(f"  python -m src.models.statement_parser.label_generator \\")
    print(f"    --input-dir {args.output_dir} \\")
    print(f"    --output-dir data/labeled_statements \\")
    print(f"    --gemini-api-key $GEMINI_API_KEY")


if __name__ == "__main__":
    main()
