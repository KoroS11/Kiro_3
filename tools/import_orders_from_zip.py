import argparse
import csv
import os
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


def _norm_header(h: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else "_" for ch in h.strip()).strip("_")


def _detect_delimiter(sample: str) -> str:
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=[",", ";", "\t", "|"])
        return dialect.delimiter
    except Exception:
        return ","


def _score_headers(headers: List[str]) -> int:
    hs = {_norm_header(h) for h in headers}
    score = 0

    if "date" in hs:
        score += 5

    order_candidates = {
        "total_orders",
        "order_count",
        "orders",
        "total",
        "num_orders",
        "number_of_orders",
    }

    if hs.intersection(order_candidates):
        score += 5

    return score


def _list_csv_files(root: Path) -> List[Path]:
    return [p for p in root.rglob("*.csv") if p.is_file()]


def _read_headers(csv_path: Path) -> Tuple[List[str], str]:
    text = csv_path.read_text(encoding="utf-8", errors="replace")
    sample = "\n".join(text.splitlines()[:20])
    delimiter = _detect_delimiter(sample)

    with csv_path.open("r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.reader(f, delimiter=delimiter)
        headers = next(reader, [])

    return headers, delimiter


def _pick_best_csv(csv_files: List[Path]) -> Optional[Path]:
    best: Optional[Path] = None
    best_score = -1

    for p in csv_files:
        try:
            headers, _ = _read_headers(p)
        except Exception:
            continue

        score = _score_headers(headers)
        if score > best_score:
            best_score = score
            best = p

    return best


def _find_column(headers: List[str], candidates: Iterable[str]) -> Optional[int]:
    norm = [_norm_header(h) for h in headers]
    for c in candidates:
        c_norm = _norm_header(c)
        if c_norm in norm:
            return norm.index(c_norm)
    return None


def _convert_orders_csv(src: Path, out_csv: Path) -> None:
    headers, delimiter = _read_headers(src)
    date_idx = _find_column(headers, ["date"])
    orders_idx = _find_column(headers, ["total_orders", "order_count", "orders", "total", "num_orders"])

    if date_idx is None:
        raise ValueError("Missing date column in selected CSV")
    if orders_idx is None:
        raise ValueError("Missing orders column (total_orders/order_count) in selected CSV")

    out_csv.parent.mkdir(parents=True, exist_ok=True)

    with src.open("r", encoding="utf-8", errors="replace", newline="") as f_in, out_csv.open(
        "w", encoding="utf-8", newline=""
    ) as f_out:
        reader = csv.reader(f_in, delimiter=delimiter)
        writer = csv.writer(f_out)

        _ = next(reader, None)
        writer.writerow(["date", "total_orders"])

        rows_written = 0
        for row in reader:
            if not row:
                continue

            date_val = row[date_idx].strip() if date_idx < len(row) else ""
            orders_val = row[orders_idx].strip() if orders_idx < len(row) else ""

            if not date_val:
                continue

            writer.writerow([date_val, orders_val])
            rows_written += 1

    if rows_written < 7:
        raise ValueError(f"Output has too few rows ({rows_written}).")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Import an orders CSV from a zip archive and convert it to canonical format: date,total_orders. "
            "The date format is preserved and will be normalized by the JS pipeline later."
        )
    )
    parser.add_argument("--zip", required=True, help="Path to the zip file.")
    parser.add_argument(
        "--out",
        required=True,
        help="Output CSV path (recommended: data-weaver/public/sample-data/orders.csv).",
    )
    parser.add_argument(
        "--pick",
        default=None,
        help="Optional: specific CSV path inside the extracted zip (relative path).",
    )
    parser.add_argument(
        "--extract-dir",
        default=None,
        help="Optional: directory to extract zip contents into (default: temp dir).",
    )

    args = parser.parse_args()

    zip_path = Path(args.zip).resolve()
    if not zip_path.exists():
        raise SystemExit(f"Zip not found: {zip_path}")

    out_path = Path(args.out).resolve()

    if args.extract_dir:
        extract_root = Path(args.extract_dir).resolve()
        extract_root.mkdir(parents=True, exist_ok=True)
        temp_ctx = None
    else:
        temp_ctx = tempfile.TemporaryDirectory(prefix="orders_zip_")
        extract_root = Path(temp_ctx.name)

    try:
        with zipfile.ZipFile(zip_path, "r") as z:
            z.extractall(extract_root)

        csv_files = _list_csv_files(extract_root)
        if not csv_files:
            raise SystemExit("No .csv files found inside the zip.")

        if args.pick:
            selected = (extract_root / args.pick).resolve()
            if not selected.exists():
                raise SystemExit(f"Requested CSV not found after extraction: {selected}")
        else:
            selected = _pick_best_csv(csv_files)
            if selected is None:
                raise SystemExit("Could not auto-detect an orders CSV. Use --pick to select one.")

        print("Selected orders CSV:", str(selected))
        _convert_orders_csv(selected, out_path)
        print("Wrote canonical orders CSV:", str(out_path))

        if not args.extract_dir:
            print("Extraction used a temporary directory.")
        else:
            print("Extracted zip contents to:", str(extract_root))

    finally:
        if temp_ctx is not None:
            temp_ctx.cleanup()


if __name__ == "__main__":
    main()
