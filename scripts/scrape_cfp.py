#!/usr/bin/env python3
"""
Scrape CFP (Call for Papers) information from various sources
"""
import json
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from pathlib import Path
import time

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Installing required packages...")
    import subprocess
    subprocess.run(["pip3", "install", "requests", "beautifulsoup4"], check=True)
    import requests
    from bs4 import BeautifulSoup


class CFPScraper:
    """Scraper for conference CFP information"""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })

    def search_wikicfp_multi_year(self, conference_name: str, target_years: list) -> Dict[int, Dict]:
        """Search WikiCFP for conference information for multiple years"""
        try:
            # Search WikiCFP - search for all conferences (no year filter)
            # This ensures we get both current and future year events
            search_url = f"http://www.wikicfp.com/cfp/servlet/tool.search"

            # For better search results, keep spaces in the query
            # but remove "ACM" prefix if present
            search_query = conference_name.replace('ACM ', '')
            params = {'q': search_query, 'year': 'a'}  # 'a' for all years

            response = self.session.get(search_url, params=params, timeout=10)
            if response.status_code != 200:
                return {}

            soup = BeautifulSoup(response.content, 'html.parser')

            # Find conference entries by looking for eventid links
            # Collect all potential event links first (don't filter by name yet)
            event_links = []

            for link in soup.find_all('a', href=True):
                if 'eventid' in link['href'] and 'showcfp' in link['href']:
                    event_links.append(link)

            if not event_links:
                return {}

            # Collect data for each target year
            year_data = {}
            today = datetime.now().date()

            for event_link in event_links[:30]:  # Check more events to find all years
                event_url = f"http://www.wikicfp.com{event_link['href']}"
                details = self.get_wikicfp_details(event_url)

                if not details:
                    continue

                # Check if this event matches our conference
                # Match by link text, event title, or "When" field
                link_text = event_link.get_text(strip=True).lower()
                event_title = details.get('event_title', '').lower()
                when_text = details.get('when_text', '').lower()

                # Normalize for matching: remove spaces from conference name but not from texts
                # This allows "WWW" to match "The Web 2026 : WWW 2026" in the event title
                conference_name_normalized = conference_name.lower().replace('acm ', '').strip()

                # Check if conference name appears as a standalone word (word boundary check)
                # This prevents "WWW" from matching "CIAWI" or other conferences
                import re
                # Use word boundary regex for more accurate matching
                # For short conference names (<=3 chars), be more strict to avoid false matches
                # e.g., "CC" should not match "AI-CC", but should match "CC 2026" or ": CC"
                if len(conference_name_normalized) <= 3:
                    # For short names, require space, colon, or start/end of string before/after
                    pattern = r'(?:^|[\s:])' + re.escape(conference_name_normalized) + r'(?:[\s:]|$)'
                else:
                    # For longer names, regular word boundary is fine
                    pattern = r'\b' + re.escape(conference_name_normalized) + r'\b'

                link_match = re.search(pattern, link_text) is not None
                title_match = re.search(pattern, event_title) is not None
                when_match = re.search(pattern, when_text) is not None

                if not link_match and not title_match and not when_match:
                    # Skip this event if it doesn't match
                    continue

                # Determine the year of this event
                # Priority order:
                # 1. Extract from page title (most reliable)
                # 2. Extract from conference dates
                # 3. Infer from deadlines (least reliable)
                event_year = None

                # 1. Try to extract year from page title
                # Format: "ACL 2025 : ..." or "WWW 2026 : ..."
                if details.get('page_title'):
                    import re
                    # Look for 4-digit year (20XX) near the beginning of title
                    year_match = re.search(r'\b(20\d{2})\b', details['page_title'][:50])
                    if year_match:
                        try:
                            event_year = int(year_match.group(1))
                        except:
                            pass

                # 2. If no year from title, try conference dates
                if not event_year and details.get('conference_dates', {}).get('start'):
                    try:
                        conf_date = datetime.strptime(details['conference_dates']['start'], '%Y-%m-%d')
                        event_year = conf_date.year
                    except:
                        pass

                # 3. If still no year, try to infer from deadlines (least reliable)
                if not event_year and details.get('deadlines'):
                    for dl in details['deadlines']:
                        if dl.get('date'):
                            try:
                                dl_date = datetime.strptime(dl['date'], '%Y-%m-%d')
                                # Assume deadline is for next year's conference
                                # This is a fallback and may not always be correct
                                event_year = dl_date.year + 1
                                break
                            except:
                                pass

                # Store if this is a target year and we don't have better data yet
                if event_year in target_years:
                    # Calculate match quality (prefer exact matches in link text)
                    new_match_quality = 0
                    if link_match:
                        new_match_quality = 3  # Highest priority: match in link text
                    elif title_match and not '/' in event_title:  # Avoid titles like "WWW/Internet"
                        new_match_quality = 2
                    elif title_match:
                        new_match_quality = 1  # Lowest: match in composite title

                    if event_year not in year_data:
                        year_data[event_year] = details
                    else:
                        # Calculate existing match quality
                        existing_link_text = year_data[event_year].get('_link_text', '')
                        existing_title = year_data[event_year].get('event_title', '').lower()
                        existing_match_quality = 0
                        if re.search(pattern, existing_link_text) is not None:
                            existing_match_quality = 3
                        elif re.search(pattern, existing_title) is not None and not '/' in existing_title:
                            existing_match_quality = 2
                        elif re.search(pattern, existing_title) is not None:
                            existing_match_quality = 1

                        # Replace if new match is better quality
                        if new_match_quality > existing_match_quality:
                            year_data[event_year] = details
                            year_data[event_year]['_link_text'] = link_text
                        # If same quality, check future deadlines
                        elif new_match_quality == existing_match_quality:
                            existing_has_future = any(
                                datetime.strptime(dl['date'], '%Y-%m-%d').date() > today
                                for dl in year_data[event_year].get('deadlines', [])
                                if dl.get('date')
                            )
                            new_has_future = any(
                                datetime.strptime(dl['date'], '%Y-%m-%d').date() > today
                                for dl in details.get('deadlines', [])
                                if dl.get('date')
                            )

                            # Replace if new data has future deadlines and existing doesn't
                            if new_has_future and not existing_has_future:
                                year_data[event_year] = details
                                year_data[event_year]['_link_text'] = link_text
                            # Or if both have future deadlines but new one has more complete data
                            elif new_has_future and existing_has_future:
                                if len(details.get('deadlines', [])) > len(year_data[event_year].get('deadlines', [])):
                                    year_data[event_year] = details
                                    year_data[event_year]['_link_text'] = link_text

                    # Store link text for comparison
                    if event_year in year_data and '_link_text' not in year_data[event_year]:
                        year_data[event_year]['_link_text'] = link_text

                # Don't stop early - check all events to find all target years

            return year_data

        except Exception as e:
            print(f"Error searching WikiCFP for {conference_name}: {e}")
            return {}

    def get_wikicfp_details(self, url: str) -> Optional[Dict]:
        """Get detailed information from a WikiCFP event page"""
        try:
            response = self.session.get(url, timeout=10)
            if response.status_code != 200:
                return None

            soup = BeautifulSoup(response.content, 'html.parser')

            details = {
                'source': 'wikicfp',
                'url': url,
                'deadlines': [],
                'conference_dates': {},
                'when_text': '',  # Store the "When" field text for matching
                'event_title': '',  # Store the event title for matching
                'page_title': ''  # Store the page <title> tag for year extraction
            }

            # Extract page title (from <title> tag) for accurate year detection
            # Title format: "ACL 2025 : The 63rd Annual Meeting..."
            page_title_tag = soup.find('title')
            if page_title_tag:
                details['page_title'] = page_title_tag.get_text(strip=True)

            # Extract event title (contains conference name and year)
            # Title format: "The Web 2026 : WWW 2026 : The Web Conference"
            title_tags = soup.find_all(['h1', 'h2', 'h3'])
            if title_tags:
                details['event_title'] = title_tags[0].get_text(strip=True)

            # Extract important dates from all tables
            # WikiCFP uses <th> for labels and <td> for values
            tables = soup.find_all('table')
            for table in tables:
                rows = table.find_all('tr')
                for row in rows:
                    # Look for rows with <th> (label) and <td> (value)
                    th = row.find('th')
                    td = row.find('td')

                    if th and td:
                        label = th.get_text(strip=True)
                        value = td.get_text(strip=True)

                        label_lower = label.lower()

                        # Parse different types of deadlines
                        # Check for any deadline-related keywords
                        deadline_keywords = ['deadline', 'due', 'submission', 'notification', 'registration', 'camera', 'final']
                        if any(keyword in label_lower for keyword in deadline_keywords):
                            date = self.parse_date(value)
                            if date:
                                # Determine deadline type and label
                                deadline_type = None
                                deadline_label = label  # Use original label text

                                if 'abstract' in label_lower and 'registration' in label_lower:
                                    deadline_type = 'abstract_registration'
                                elif 'submission deadline' in label_lower or 'submission due' in label_lower:
                                    deadline_type = 'submission'
                                elif 'notification' in label_lower:
                                    deadline_type = 'notification'
                                elif 'final version' in label_lower or 'camera ready' in label_lower:
                                    deadline_type = 'camera_ready'
                                elif 'workshop' in label_lower:
                                    deadline_type = 'workshop'
                                elif 'poster' in label_lower:
                                    deadline_type = 'poster'
                                elif 'demo' in label_lower:
                                    deadline_type = 'demo'
                                else:
                                    # Generic deadline type based on label
                                    deadline_type = 'other'

                                details['deadlines'].append({
                                    'type': deadline_type,
                                    'date': date,
                                    'label': deadline_label
                                })
                        elif label_lower == 'when':
                            # Store the "When" field text for conference name matching
                            details['when_text'] = value
                            dates = self.parse_date_range(value)
                            if dates:
                                details['conference_dates'] = dates

            return details

        except Exception as e:
            print(f"Error getting WikiCFP details from {url}: {e}")
            return None

    def parse_date(self, date_str: str) -> Optional[str]:
        """Parse date string to ISO format"""
        if not date_str or date_str.lower() in ['tbd', 'n/a', 'none']:
            return None

        # Common date formats
        date_formats = [
            '%B %d, %Y',  # January 15, 2024
            '%b %d, %Y',  # Jan 15, 2024
            '%Y-%m-%d',   # 2024-01-15
            '%d %B %Y',   # 15 January 2024
            '%d %b %Y',   # 15 Jan 2024
        ]

        # Clean the date string
        date_str = re.sub(r'\s+', ' ', date_str).strip()

        for fmt in date_formats:
            try:
                dt = datetime.strptime(date_str, fmt)
                return dt.strftime('%Y-%m-%d')
            except ValueError:
                continue

        return None

    def parse_date_range(self, date_str: str) -> Optional[Dict]:
        """Parse date range string"""
        if not date_str:
            return None

        # Try to find date patterns
        dates = re.findall(r'\w+ \d+(?:, \d{4})?', date_str)
        if len(dates) >= 2:
            start_date = self.parse_date(dates[0])
            end_date = self.parse_date(dates[-1])
            if start_date and end_date:
                return {
                    'start': start_date,
                    'end': end_date
                }

        return None

    def deduplicate_deadlines(self, deadlines: List[Dict]) -> List[Dict]:
        """Remove duplicate deadlines based on type and date"""
        seen = set()
        unique_deadlines = []

        for deadline in deadlines:
            key = (deadline.get('type'), deadline.get('date'))
            if key not in seen:
                seen.add(key)
                unique_deadlines.append(deadline)

        return unique_deadlines

    def predict_next_year_dates(self, previous_dates: Dict) -> Dict:
        """Predict next year's dates based on previous year"""
        predicted = {
            'is_predicted': True,
            'deadlines': [],
            'conference_dates': {}
        }

        # Predict deadlines
        for deadline in previous_dates.get('deadlines', []):
            if deadline.get('date'):
                try:
                    prev_date = datetime.strptime(deadline['date'], '%Y-%m-%d')
                    # Add one year
                    next_date = prev_date.replace(year=prev_date.year + 1)

                    predicted['deadlines'].append({
                        'type': deadline['type'],
                        'date': next_date.strftime('%Y-%m-%d'),
                        'label': deadline.get('label', ''),
                        'is_predicted': True
                    })
                except Exception:
                    continue

        # Predict conference dates
        if previous_dates.get('conference_dates'):
            conf_dates = previous_dates['conference_dates']
            if conf_dates.get('start'):
                try:
                    prev_start = datetime.strptime(conf_dates['start'], '%Y-%m-%d')
                    next_start = prev_start.replace(year=prev_start.year + 1)
                    predicted['conference_dates']['start'] = next_start.strftime('%Y-%m-%d')

                    if conf_dates.get('end'):
                        prev_end = datetime.strptime(conf_dates['end'], '%Y-%m-%d')
                        next_end = prev_end.replace(year=prev_end.year + 1)
                        predicted['conference_dates']['end'] = next_end.strftime('%Y-%m-%d')
                except Exception:
                    pass

        return predicted


def update_conferences_with_cfp(conferences_data: Dict) -> Dict:
    """Update conference data with CFP information"""
    scraper = CFPScraper()

    # Determine target years (current year, next year, next+1 year)
    current_year = datetime.now().year
    target_years = [current_year, current_year + 1, current_year + 2]

    print(f"Scraping CFP information for {len(conferences_data['conferences'])} conferences...")
    print(f"Target years: {target_years}")

    for i, conf in enumerate(conferences_data['conferences']):
        name = conf['short_name'] or conf['name']
        print(f"[{i+1}/{len(conferences_data['conferences'])}] Searching for: {name}")

        # Search WikiCFP for multiple years
        year_data_map = scraper.search_wikicfp_multi_year(name, target_years)

        if year_data_map:
            print(f"  → Found data for years: {list(year_data_map.keys())}")

            # Update URL from the most recent year's data
            for year in sorted(year_data_map.keys(), reverse=True):
                if year_data_map[year].get('url'):
                    conf['url'] = year_data_map[year]['url']
                    break

            # Process each year's data
            today = datetime.now().date()
            for year, cfp_data in year_data_map.items():
                year_str = str(year)

                # Check if existing data is predicted
                existing_info = conf.get('information', {}).get(year_str, {})
                existing_is_predicted = False
                if existing_info.get('deadlines'):
                    existing_is_predicted = any(dl.get('is_predicted', False) for dl in existing_info['deadlines'])

                # If we have actual data and existing is predicted, replace it
                if existing_is_predicted:
                    print(f"  → Year {year}: Replacing predicted data with actual data")

                conf['information'][year_str] = {
                    'deadlines': scraper.deduplicate_deadlines(cfp_data.get('deadlines', [])),
                    'conference_dates': cfp_data.get('conference_dates', {})
                }

            # For years without actual data, try to predict from previous year
            # Only predict if we have actual data from the immediate previous year
            for year in target_years:
                year_str = str(year)
                if year_str not in conf['information']:
                    # Try to predict from previous year
                    prev_year_str = str(year - 1)
                    if prev_year_str in conf['information']:
                        prev_data = conf['information'][prev_year_str]
                        # Check if previous year data is actual (not predicted)
                        prev_is_predicted = any(dl.get('is_predicted', False) for dl in prev_data.get('deadlines', []))

                        # Only predict from actual data, not from predicted data
                        if not prev_is_predicted and (prev_data.get('deadlines') or prev_data.get('conference_dates')):
                            print(f"  → Year {year}: Predicting from actual {year - 1} data")
                            predicted = scraper.predict_next_year_dates(prev_data)
                            if predicted.get('deadlines') or predicted.get('conference_dates'):
                                # Mark as predicted
                                for dl in predicted.get('deadlines', []):
                                    dl['is_predicted'] = True
                                conf['information'][year_str] = {
                                    'deadlines': predicted.get('deadlines', []),
                                    'conference_dates': predicted.get('conference_dates', {}),
                                    'is_predicted': True  # Mark the entire year as predicted
                                }
                        elif prev_is_predicted:
                            print(f"  → Year {year}: Skipping prediction (previous year is also predicted)")
        else:
            print(f"  → No data found")
            # Try to predict from existing data if available
            if conf.get('information'):
                for year in target_years:
                    year_str = str(year)
                    if year_str not in conf['information']:
                        prev_year_str = str(year - 1)
                        if prev_year_str in conf['information']:
                            prev_data = conf['information'][prev_year_str]
                            # Check if previous year data is actual (not predicted)
                            prev_is_predicted = any(dl.get('is_predicted', False) for dl in prev_data.get('deadlines', []))

                            # Only predict from actual data
                            if not prev_is_predicted and (prev_data.get('deadlines') or prev_data.get('conference_dates')):
                                print(f"  → Year {year}: Predicting from existing actual {year - 1} data")
                                predicted = scraper.predict_next_year_dates(prev_data)
                                if predicted.get('deadlines') or predicted.get('conference_dates'):
                                    for dl in predicted.get('deadlines', []):
                                        dl['is_predicted'] = True
                                    conf['information'][year_str] = {
                                        'deadlines': predicted.get('deadlines', []),
                                        'conference_dates': predicted.get('conference_dates', {}),
                                        'is_predicted': True
                                    }
                            elif prev_is_predicted:
                                print(f"  → Year {year}: Skipping prediction (previous year is also predicted)")

        # Be nice to the server
        time.sleep(1)

    conferences_data['last_updated'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    return conferences_data


if __name__ == "__main__":
    # Load base conference data (from public/data for web access)
    base_data_path = Path(__file__).parent.parent / "public" / "data" / "conferences_base.json"

    with open(base_data_path, 'r', encoding='utf-8') as f:
        conferences_data = json.load(f)

    # Update with CFP information
    updated_data = update_conferences_with_cfp(conferences_data)

    # Save updated data (in public/data for web access)
    output_path = Path(__file__).parent.parent / "public" / "data" / "conferences_with_cfp.json"

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(updated_data, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Saved updated conference data to {output_path}")
    print(f"✓ Last updated: {updated_data['last_updated']}")
