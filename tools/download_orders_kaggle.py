import argparse
import os
from pathlib import Path

import kagglehub


def main() -> None:
    parser = argparse.ArgumentParser(description="Download the orders dataset via KaggleHub.")
    parser.add_argument(
        "--dataset",
        default="sujalsuthar/food-delivery-order-history-data",
        help="Kaggle dataset identifier.",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Optional output directory for copying files (default: do not copy).",
    )

    args = parser.parse_args()

    dataset_path = kagglehub.dataset_download(args.dataset)
    print("Path to dataset files:", dataset_path)

    if args.out:
        out_dir = Path(args.out).resolve()
        out_dir.mkdir(parents=True, exist_ok=True)

        src_dir = Path(dataset_path)
        for p in src_dir.rglob("*"):
            if p.is_file():
                rel = p.relative_to(src_dir)
                dest = out_dir / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(p.read_bytes())

        print("Copied dataset files to:", str(out_dir))


if __name__ == "__main__":
    main()
