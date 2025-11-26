#!/usr/bin/env python3
"""
Parse conferences CSV and analyze structure
"""
import csv
import json
import sys
from pathlib import Path
from typing import List, Dict

def read_csv_with_encoding(file_path: str, encoding: str = 'utf-8') -> List[Dict]:
    """Read CSV file with specified encoding"""
    conferences = []

    # Try different encodings
    encodings = [encoding, 'utf-8', 'shift_jis', 'cp932', 'iso-2022-jp']

    for enc in encodings:
        try:
            with open(file_path, 'r', encoding=enc) as f:
                reader = csv.DictReader(f)
                conferences = list(reader)
                print(f"Successfully read with encoding: {enc}")
                print(f"Total conferences: {len(conferences)}")
                print(f"Columns: {conferences[0].keys() if conferences else 'None'}")
                return conferences
        except UnicodeDecodeError:
            continue
        except Exception as e:
            print(f"Error with {enc}: {e}")
            continue

    raise ValueError("Could not read CSV with any encoding")

def analyze_csv_structure(file_path: str):
    """Analyze CSV structure and print sample data"""
    conferences = read_csv_with_encoding(file_path)

    if conferences:
        print("\n=== Sample Conference Data ===")
        for i, conf in enumerate(conferences[:5]):
            print(f"\n--- Conference {i+1} ---")
            for key, value in conf.items():
                print(f"{key}: {value}")

    return conferences

def create_conference_json(conferences: List[Dict]) -> Dict:
    """Convert conferences to structured JSON format"""
    import re

    structured_data = {
        "conferences": [],
        "themes": set(),
        "last_updated": None
    }

    # Group conferences by normalized full name to merge duplicates
    # This handles cases where same conference has different short names
    conferences_map = {}

    for conf in conferences:
        # Normalize full name for matching (strip whitespace, lowercase)
        full_name = conf.get("正式名称", "").strip()
        full_name_key = full_name.lower().strip()

        # Remove numeric prefix from theme (e.g., "10. " -> "")
        theme = conf.get("注力テーマ", "")
        theme = re.sub(r'^\d+\.\s*', '', theme).strip()

        # If this conference doesn't exist yet, create it
        if full_name_key not in conferences_map:
            conf_data = {
                "name": full_name,
                "short_name": conf.get("略称", "").strip(),
                "themes": [theme] if theme else [],  # Changed to array
                "rank": conf.get("ランク", ""),
                "category": conf.get("分野小分類", ""),
                "information": {},  # Year-based information
                "url": "",  # To be filled by scraping
            }
            conferences_map[full_name_key] = conf_data
        else:
            # Conference already exists, add theme if not already present
            existing_conf = conferences_map[full_name_key]
            if theme and theme not in existing_conf["themes"]:
                existing_conf["themes"].append(theme)

            # Prefer shorter abbreviation if multiple exist
            existing_short = existing_conf["short_name"]
            new_short = conf.get("略称", "").strip()
            if new_short and (not existing_short or len(new_short) < len(existing_short)):
                existing_conf["short_name"] = new_short

        # Add theme to global themes set
        if theme:
            structured_data["themes"].add(theme)

    # Convert map to list
    structured_data["conferences"] = list(conferences_map.values())

    # Convert set to list for JSON serialization
    structured_data["themes"] = sorted(list(structured_data["themes"]))

    return structured_data

if __name__ == "__main__":
    # Use relative path to CSV file in project directory
    # Or use command line argument for custom CSV path
    if len(sys.argv) > 1:
        csv_path = Path(sys.argv[1])
        print(f"Using custom CSV path: {csv_path}")
    else:
        csv_path = Path(__file__).parent.parent / "public" / "data" / "conferences.csv"
        print(f"Using default CSV path: {csv_path}")

    # Analyze structure
    conferences = analyze_csv_structure(csv_path)

    # Create structured JSON
    structured_data = create_conference_json(conferences)

    # Save to file (in public/data for web access)
    output_path = Path(__file__).parent.parent / "public" / "data" / "conferences_base.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(structured_data, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Saved base conference data to {output_path}")
    print(f"✓ Total conferences: {len(structured_data['conferences'])}")
    print(f"✓ Total themes: {len(structured_data['themes'])}")
