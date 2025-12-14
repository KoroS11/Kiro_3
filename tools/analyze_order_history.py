import csv
from collections import Counter
from pathlib import Path


def main() -> None:
    in_path = Path(__file__).resolve().parents[1] / "archive" / "order_history_kaggle_data.csv"
    if not in_path.exists():
        raise SystemExit(f"Missing file: {in_path}")

    city_counts: Counter[str] = Counter()
    status_counts: Counter[str] = Counter()

    with in_path.open("r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            raise SystemExit("Missing header")

        missing = [c for c in ("City", "Order Placed At", "Order Status") if c not in reader.fieldnames]
        if missing:
            raise SystemExit(f"Missing columns: {missing}")

        rows = 0
        for row in reader:
            rows += 1
            city = (row.get("City") or "").strip()
            status = (row.get("Order Status") or "").strip()
            if city:
                city_counts[city] += 1
            if status:
                status_counts[status] += 1

    print("Rows:", rows)
    print("Top cities:")
    for city, n in city_counts.most_common(10):
        print(f"  {city}: {n}")

    print("Order statuses:")
    for status, n in status_counts.most_common():
        print(f"  {status}: {n}")


if __name__ == "__main__":
    main()
