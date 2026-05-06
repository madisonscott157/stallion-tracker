#!/usr/bin/env python3
"""
Scrape race histories for all horses from France Galop.
Reads FG horse IDs from horse_fg_head_valeur.json, fetches performance data via AJAX,
and saves to data/race_histories.json.
"""

import requests
import json
import re
import time
import os
from bs4 import BeautifulSoup
from pathlib import Path

BASE = "https://www.france-galop.com"
LOGIN_URL = f"{BASE}/fr/login"
PERF_AJAX_URL = f"{BASE}/fr/frglp-global/ajax"

EMAIL = "madison@solislitt.com"
PASSWORD = "smarty157"

PROJECT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_DIR / "data"
OUTPUT_FILE = DATA_DIR / "race_histories.json"
VALEUR_FILE = DATA_DIR / "horse_fg_head_valeur.json"


def login(session):
    """Login to France Galop."""
    resp = session.get(LOGIN_URL)
    soup = BeautifulSoup(resp.text, 'html.parser')
    form = soup.find('form', {'id': 'user-login-form'})
    if not form:
        for f in soup.find_all('form'):
            if f.find('input', {'type': 'password'}):
                form = f
                break
    if not form:
        print("ERROR: No login form found")
        return False

    form_data = {}
    for inp in form.find_all('input'):
        name = inp.get('name')
        if name:
            form_data[name] = inp.get('value', '')
    form_data['name'] = EMAIL
    form_data['pass'] = PASSWORD
    submit = form.find('input', {'type': 'submit'})
    if submit and submit.get('name'):
        form_data[submit['name']] = submit.get('value', '')

    action = form.get('action', '/fr/login')
    if action.startswith('/'):
        action = BASE + action

    resp = session.post(action, data=form_data, allow_redirects=True)
    if 'Mon espace' in resp.text or '/account' in resp.url:
        print("Login successful!")
        return True
    print("Login may have failed, continuing anyway...")
    return True


def extract_horse_id(fg_path):
    """Extract the encoded horse ID from a France Galop path like /fr/cheval/ENCODED_ID."""
    if not fg_path:
        return None
    # Path format: /fr/cheval/ENCODED_ID
    parts = fg_path.rstrip('/').split('/')
    if len(parts) >= 1:
        return parts[-1]
    return None


def fetch_performances(session, horse_id, horse_name):
    """Fetch all flat performances for a horse via AJAX."""
    try:
        resp = session.get(PERF_AJAX_URL, params={
            'module': 'cheval_performances',
            'id_cheval': horse_id,
            'specialty': '4',  # flat racing
            'year': '',
            'jockey': '',
            'proprietaire': '',
            'entraineur': '',
            'nbResult': '200',
        }, headers={'X-Requested-With': 'XMLHttpRequest'}, timeout=30)
    except requests.exceptions.RequestException as e:
        print(f"  Request error: {e}")
        return []

    if resp.status_code != 200:
        print(f"  HTTP {resp.status_code}")
        return []

    if 'login' in resp.url or len(resp.text) < 50:
        print(f"  Redirected to login or empty response")
        return []

    soup = BeautifulSoup(resp.text, 'html.parser')
    performances = []

    for tr in soup.find_all('tr'):
        cells = tr.find_all('td')
        if len(cells) < 10:
            continue

        perf = {}
        for cell in cells:
            label = cell.get('data-label', '')
            value_span = cell.find('span', class_='content_value')
            if value_span:
                text = value_span.get_text(strip=True)
            else:
                text = cell.get_text(strip=True)
            if label:
                perf[label] = text
            # Extract race detail link from the DateReunion cell
            if label == 'DateReunion':
                a_tag = cell.find('a', href=True)
                if a_tag:
                    perf['_race_link'] = a_tag['href']

        if perf:
            performances.append(perf)

    return performances


def parse_race(perf):
    """Parse a raw performance dict into a clean race record.

    Actual data-label names from France Galop AJAX (cheval_performances):
      DateReunion, Hippodrome, NbPlace, DistanceParcouru, Discipline,
      Categorie, CategBlackType, PoidsPorte, NomProprietaire, NomEntraineur,
      NomJockey, Gains, PrimeProp, PrimeEleveur, Valeur, NomVideo

    NOTE: Number of runners (NbPartants) is NOT available from this endpoint.
    It would require fetching each individual race detail page.
    """
    return {
        'date': perf.get('DateReunion', '').strip(),
        'hippodrome': perf.get('Hippodrome', '').strip(),
        'place': perf.get('NbPlace', '').strip(),
        'distance': perf.get('DistanceParcouru', '').strip(),
        'discipline': perf.get('Discipline', '').strip(),
        'category': perf.get('Categorie', '').strip(),
        'category_bt': perf.get('CategBlackType', '').strip(),
        'weight': perf.get('PoidsPorte', '').strip(),
        'owner': perf.get('NomProprietaire', '').strip(),
        'jockey': perf.get('NomJockey', '').strip(),
        'trainer': perf.get('NomEntraineur', '').strip(),
        'gains': perf.get('Gains', '').strip(),
        'valeur': perf.get('Valeur', '').strip(),
        'race_link': perf.get('_race_link', ''),
    }


def load_existing():
    """Load existing race_histories.json if present (for resume support)."""
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE) as f:
            return json.load(f)
    return {}


def save_results(results):
    """Save results to JSON."""
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)


def main():
    # Load horse FG data
    with open(VALEUR_FILE) as f:
        valeur_data = json.load(f)

    horses = valeur_data.get('horses', valeur_data)

    # Build lookup: horse_name -> horse_id
    horse_ids = {}
    for name, info in horses.items():
        fg_path = info.get('fg_path', '')
        horse_id = extract_horse_id(fg_path)
        if horse_id:
            horse_ids[name] = horse_id

    print(f"Found {len(horse_ids)} horses with FG IDs")

    # Load existing results for resume
    results = load_existing()
    already_done = set(results.keys())
    if already_done:
        print(f"Already scraped {len(already_done)} horses, resuming...")

    # Setup session
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    })

    login(session)

    # Scrape each horse
    to_scrape = sorted(set(horse_ids.keys()) - already_done)
    total = len(to_scrape)
    print(f"Scraping {total} horses...")

    for i, name in enumerate(to_scrape):
        horse_id = horse_ids[name]
        print(f"[{i+1}/{total}] {name} (id={horse_id[:20]}...)")

        perfs = fetch_performances(session, horse_id, name)
        races = [parse_race(p) for p in perfs]

        results[name] = races
        print(f"  -> {len(races)} races found")

        # Save periodically (every 20 horses)
        if (i + 1) % 20 == 0:
            save_results(results)
            print(f"  [checkpoint saved: {len(results)} horses]")

        time.sleep(0.5)

    # Final save
    save_results(results)

    # Summary
    total_horses = len(results)
    total_races = sum(len(r) for r in results.values())
    with_races = sum(1 for r in results.values() if r)
    print(f"\nDone! {total_horses} horses, {with_races} with races, {total_races} total race records")
    print(f"Saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
