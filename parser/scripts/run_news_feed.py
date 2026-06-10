#!/usr/bin/env python3
"""News feed ingestion cron entry point.

Pulls racing-outlet RSS feeds, matches article title+summary against
tracked progeny names (see news_matcher.py), and inserts matched
articles into news_items with per-stallion tags in news_item_tags.
Dedup is on the article URL.

Run from the parser/ directory:
    python3 scripts/run_news_feed.py --dry-run   # print matches, no writes
    python3 scripts/run_news_feed.py             # write to DB
    python3 scripts/run_news_feed.py --feed TDN  # single feed by name
"""

import argparse
import os
import sys
from datetime import datetime, timezone

import feedparser
import requests
from bs4 import BeautifulSoup

# Path setup matches main.py — flat imports from parser/.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir))

from db import Database
from news_matcher import NewsMatcher, TrackedHorse

# Paulick Report and BloodHorse sit behind bot protection (Incapsula) and
# don't expose a reachable RSS feed — revisit if that changes.
FEEDS = [
    ('TDN', 'https://www.thoroughbreddailynews.com/feed/'),
    ('TDN Europe', 'https://www.thoroughbreddailynews.com/category/europe/feed/'),
    ('America\'s Best Racing', 'https://www.americasbestracing.net/rss.xml'),
    ('The Racing Biz', 'https://www.theracingbiz.com/feed/'),
]

USER_AGENT = (
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'
)
SNIPPET_MAX = 300


def load_matcher(db: Database) -> NewsMatcher:
    """Build the matcher from all named progeny of tracked stallions."""
    resp = (
        db.client.from_('horses')
        .select('id, name, sire_id, is_unnamed')
        .execute()
    )
    horses = [
        TrackedHorse(id=row['id'], name=row['name'], sire_id=row['sire_id'])
        for row in (resp.data or [])
        if row.get('name') and not row.get('is_unnamed') and row.get('sire_id')
    ]
    return NewsMatcher(horses)


def fetch_feed(name: str, url: str):
    """Fetch and parse one RSS feed. Returns feedparser entries ([] on error)."""
    try:
        resp = requests.get(url, headers={'User-Agent': USER_AGENT}, timeout=20)
        resp.raise_for_status()
    except requests.RequestException as exc:
        print(f'  WARN {name}: fetch failed: {exc}')
        return []
    parsed = feedparser.parse(resp.content)
    if parsed.bozo and not parsed.entries:
        print(f'  WARN {name}: unparseable feed ({parsed.bozo_exception})')
        return []
    return parsed.entries


def entry_snippet(entry) -> str:
    """Plain-text summary, HTML stripped, capped at SNIPPET_MAX chars."""
    html = entry.get('summary') or ''
    if not html:
        return ''
    text = BeautifulSoup(html, 'lxml').get_text(' ', strip=True)
    if len(text) > SNIPPET_MAX:
        text = text[:SNIPPET_MAX].rsplit(' ', 1)[0] + '…'
    return text


def entry_image(entry) -> str:
    """Best-effort thumbnail URL from media tags or enclosures."""
    for thumb in entry.get('media_thumbnail') or []:
        if thumb.get('url'):
            return thumb['url']
    for media in entry.get('media_content') or []:
        if media.get('url') and media.get('medium', 'image') == 'image':
            return media['url']
    for link in entry.get('links') or []:
        if link.get('rel') == 'enclosure' and (link.get('type') or '').startswith('image/'):
            return link.get('href') or ''
    return ''


def entry_published(entry) -> str:
    """ISO timestamp from the feed's published date, '' if absent."""
    parsed = entry.get('published_parsed') or entry.get('updated_parsed')
    if not parsed:
        return ''
    return datetime(*parsed[:6], tzinfo=timezone.utc).isoformat()


def existing_urls(db: Database, urls: list[str]) -> set[str]:
    """Which of these URLs are already in news_items."""
    found: set[str] = set()
    for i in range(0, len(urls), 100):
        batch = urls[i:i + 100]
        resp = db.client.from_('news_items').select('url').in_('url', batch).execute()
        found.update(row['url'] for row in (resp.data or []))
    return found


def insert_item(db: Database, source: str, entry, matches: list[TrackedHorse]) -> bool:
    """Insert one article + its stallion tags. Returns True on success."""
    # Only include fields with actual values (Supabase null-hang gotcha)
    row = {
        'title': entry.get('title', '').strip(),
        'url': entry.get('link'),
        'source': source,
    }
    snippet = entry_snippet(entry)
    if snippet:
        row['snippet'] = snippet
    image = entry_image(entry)
    if image:
        row['image_url'] = image
    published = entry_published(entry)
    if published:
        row['published_at'] = published

    try:
        resp = db.client.from_('news_items').insert(row).execute()
        item_id = resp.data[0]['id']
        tags = []
        seen_pairs = set()
        for horse in matches:
            pair = (horse.sire_id, horse.id)
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            tags.append({
                'news_item_id': item_id,
                'stallion_id': horse.sire_id,
                'horse_id': horse.id,
            })
        db.client.from_('news_item_tags').insert(tags).execute()
        return True
    except Exception as exc:
        print(f'  ERROR inserting "{row["title"][:60]}": {exc}')
        return False


def main():
    ap = argparse.ArgumentParser(description='Ingest racing news RSS feeds')
    ap.add_argument('--dry-run', action='store_true', help='print matches, no DB writes')
    ap.add_argument('--feed', help='only process the feed with this name')
    args = ap.parse_args()

    db = Database()
    matcher = load_matcher(db)
    print(f'Matcher loaded: {matcher.eligible_count} eligible progeny names')

    feeds = [(n, u) for n, u in FEEDS if not args.feed or n == args.feed]
    if not feeds:
        print(f'No feed named {args.feed!r}. Known: {[n for n, _ in FEEDS]}')
        sys.exit(1)

    counts = {'scanned': 0, 'matched': 0, 'inserted': 0, 'duplicate': 0, 'error': 0}

    for name, url in feeds:
        print(f'\n{name} — {url}')
        entries = fetch_feed(name, url)
        print(f'  {len(entries)} feed entries')

        matched = []
        for entry in entries:
            counts['scanned'] += 1
            link = entry.get('link')
            title = entry.get('title', '').strip()
            if not link or not title:
                continue
            text = f'{title} {entry_snippet(entry)}'
            matches = matcher.match(text)
            if matches:
                counts['matched'] += 1
                matched.append((entry, matches))

        if not matched:
            continue

        dupes = set()
        if not args.dry_run:
            dupes = existing_urls(db, [e.get('link') for e, _ in matched])

        for entry, matches in matched:
            via = ', '.join(f'{h.name}' for h in matches)
            if args.dry_run:
                print(f'  DRY  "{entry.get("title", "").strip()[:70]}" — via {via}')
                continue
            if entry.get('link') in dupes:
                counts['duplicate'] += 1
                continue
            if insert_item(db, name, entry, matches):
                counts['inserted'] += 1
                print(f'  NEW  "{entry.get("title", "").strip()[:70]}" — via {via}')
            else:
                counts['error'] += 1

    print(f'\nDone: {counts}')
    if counts['error']:
        sys.exit(1)


if __name__ == '__main__':
    main()
