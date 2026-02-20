import os
import datetime
import json

# GitHub Actions sets GITHUB_WORKSPACE to the repository root
# If running locally, you might need to adjust this or run from the repo root
WORKSPACE = os.environ.get('GITHUB_WORKSPACE', '.')
LIVE_HTML_PATH = os.path.join(WORKSPACE, 'live.html')
LIVES_JSON_PATH = os.path.join(WORKSPACE, 'lives.json')

def load_lives_from_json():
    """
    Reads live events from lives.json.
    """
    if not os.path.exists(LIVES_JSON_PATH):
        print(f"Error: {LIVES_JSON_PATH} not found.")
        return []
    
    try:
        with open(LIVES_JSON_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON: {e}")
        return []

def parse_date(date_str):
    """
    Parses date string YYYY-MM-DD.
    """
    try:
        return datetime.datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return None

def generate_live_list_html(lives):
    """
    Generates HTML string for live list.
    Only includes posts with future/today dates.
    """
    html_parts = []
    today = datetime.date.today()
    
    valid_lives = []

    for live in lives:
        date_str = live.get('date', '')
        event_date = parse_date(date_str)
        
        if event_date:
            if event_date >= today:
                valid_lives.append((event_date, live))
            else:
                print(f"Skipping past event: {date_str} - {live.get('title')}")
        else:
            print(f"Skipping invalid date: {date_str}")

    # Sort by date (nearest first)
    valid_lives.sort(key=lambda x: x[0])

    if not valid_lives:
        return "<p>現在、表示できるライブ情報はありません。</p>"

    for event_date, live in valid_lives:
        title = live.get('title', 'No Title')
        place = live.get('place', '')
        open_start = live.get('open_start', '')
        ticket = live.get('ticket', '')
        act = live.get('act', '')
        access = live.get('access', '')
        image = live.get('image', '')
        link = live.get('link', '#')
        
        display_date = event_date.strftime('%Y/%m/%d')

        # Build image HTML if image exists (smaller size)
        img_html = f'<img src="{image}" alt="{title}" style="max-width: 300px; width: 100%; border-radius: 5px; margin-bottom: 10px;">' if image else ''

        # Create a simple card-like HTML structure
        live_card = f"""
        <div style="border: 1px solid #ddd; padding: 15px; margin-bottom: 20px; border-radius: 5px;">
            <h3>{display_date} @ {place}</h3>
            {img_html}
            <h4>{title}</h4>
            <p>{act}</p>
            <p>🚃 {access}</p>
            <p>⏰ 開場/開演 {open_start}</p>
            <p>🎫 {ticket}</p>
        </div>
        """
        html_parts.append(live_card)
        
    return "\n".join(html_parts)

def update_live_html(new_content):
    """
    Replaces content between markers in live.html
    """
    if not os.path.exists(LIVE_HTML_PATH):
        print(f"Error: {LIVE_HTML_PATH} not found.")
        return

    with open(LIVE_HTML_PATH, 'r', encoding='utf-8') as f:
        content = f.read()

    start_marker = '<!-- LIVE_LIST_START -->'
    end_marker = '<!-- LIVE_LIST_END -->'

    pattern = re.compile(f'{re.escape(start_marker)}.*?{re.escape(end_marker)}', re.DOTALL)
    
    replacement = f"{start_marker}\n{new_content}\n{end_marker}"
    
    new_full_content = pattern.sub(replacement, content)
    
    with open(LIVE_HTML_PATH, 'w', encoding='utf-8') as f:
        f.write(new_full_content)
    
    print("Successfully updated live.html")

def main():
    print("Starting Live Info Update...")
    lives = load_lives_from_json()
    new_html = generate_live_list_html(lives)
    update_live_html(new_html)
    print("Done.")

if __name__ == "__main__":
    import re # update_live_html uses re
    main()

