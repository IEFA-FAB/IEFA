import json
import sys
from collections import defaultdict

def analyze_report(report_path):
    try:
        with open(report_path, 'r') as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error reading report: {e}")
        return

    diagnostics = data.get('diagnostics', [])
    files_with_errors = defaultdict(list)

    for diag in diagnostics:
        filepath = diag.get('location', {}).get('path', {}).get('file')
        category = diag.get('category')
        description = diag.get('description')
        start = diag.get('location', {}).get('span', [0, 0])[0]
        
        if filepath:
            files_with_errors[filepath].append({
                'category': category,
                'description': description,
                'start': start
            })

    print(f"Found {len(diagnostics)} errors in {len(files_with_errors)} files.")
    print("-" * 40)
    
    for filepath, errors in sorted(files_with_errors.items()):
        print(f"File: {filepath} ({len(errors)} errors)")
        for err in errors:
            print(f"  - {err['category']}: {err['description']}")
    
    # Output for easy parsing by the agent
    print("\n--- JSON SUMMARY ---")
    print(json.dumps(files_with_errors, indent=2))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python analyze_biome_report.py <path_to_relatorio.json>")
    else:
        analyze_report(sys.argv[1])
