import json
import sys
from collections import defaultdict

def analyze_report(file_path):
    try:
        with open(file_path, 'r') as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error reading file: {e}")
        return

    errors = []
    # Biome JSON output structure: { "diagnostics": [ ... ] }
    diagnostics = data.get("diagnostics", [])

    for d in diagnostics:
        if d.get("severity") == "error" or d.get("severity") == "warning":
            category = d.get("category", "unknown")
            file_name = d.get("location", {}).get("path", {}).get("file", "unknown")
            # line info might be in 'location' -> 'span' but for summary we don't strictly need precise line conversion right now
            description = d.get("description", "")
            errors.append({
                "file": file_name,
                "category": category,
                "description": description
            })

    # Group by file and category
    by_file = defaultdict(list)
    by_category = defaultdict(int)

    for e in errors:
        by_file[e['file']].append(e)
        by_category[e['category']] += 1

    print(f"Total Errors/Warnings: {len(errors)}")
    print("\nErrors by Category:")
    for cat, count in sorted(by_category.items(), key=lambda x: x[1], reverse=True):
        print(f"  {cat}: {count}")

    print("\nErrors by File:")
    for file, errs in sorted(by_file.items(), key=lambda x: len(x[1]), reverse=True):
        print(f"  {file}: {len(errs)}")
        # Optional: Print details if few
        # if len(errs) < 5:
        #    for err in errs:
        #        print(f"    - {err['category']}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python analyze_biome_report.py <json_file>")
    else:
        analyze_report(sys.argv[1])
