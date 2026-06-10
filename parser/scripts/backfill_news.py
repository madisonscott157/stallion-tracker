#!/usr/bin/env python3
"""One-off news backfill from WordPress JSON archives.

The live RSS feeds only expose the latest ~30 articles. TDN and The
Racing Biz are WordPress sites, so their wp-json archives let us walk
history and seed the news feed with older articles. Matching and dedup
are identical to run_news_feed.py. America's Best Racing has no public
archive API and is skipped.

Run from the parser/ directory:
    python3 scripts/backfill_news.py --dry-run            # print matches
    python3 scripts/backfill_news.py                      # write to DB
    python3 scripts/backfill_news.py --since 2026-03-01   # custom cutoff
"""

import argparse
import html
import os
import re
import sys
import time
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir))

from db import Database
from news_matcher import NewsMatcher
from run_news_feed import (
    USER_AGENT, SNIPPET_MAX, build_tags, existing_urls, load_matcher,
    load_stallion_matcher,
)

SOURCES = [
    ('TDN', 'https://www.thoroughbreddailynews.com/wp-json/wp/v2/posts'),
    ('The Racing Biz', 'https://www.theracingbiz.com/wp-json/wp/v2/posts'),
]

PER_PAGE = 50
PAGE_PAUSE_SECONDS = 0.5


def strip_html(text: str) -> str:
    if not text:
        return ''
    return BeautifulSoup(html.unescape(text), 'lxml').get_text(' ', strip=True)


def post_fields(post: dict) -> dict:
    """Normalize one wp-json post to our news_items shape."""
    title = strip_html((post.get('title') or {}).get('rendered', ''))
    snippet = strip_html((post.get('excerpt') or {}).get('rendered', ''))
    snippet = re.sub(r'\s*(Read More|Continue reading).*$', '', snippet, flags=re.I).strip()
    if len(snippet) > SNIPPET_MAX:
        snippet = snippet[:SNIPPET_MAX].rsplit(' ', 1)[0] + '…'

    image = ''
    for media in (post.get('_embedded') or {}).get('wp:featuredmedia') or []:
        if media.get('source_url'):
            image = media['source_url']
            break

    published = ''
    date_gmt = post.get('date_gmt')
    if date_gmt:
        published = date_gmt + '+00:00'

    return {
        'title': title,
        'url': post.get('link'),
        'snippet': snippet,
        'image_url': image,
        'published_at': published,
    }


def fetch_page(api_url: str, page: int) -> list[dict]:
    resp = requests.get(
        api_url,
        params={'per_page': PER_PAGE, 'page': page, '_embed': 'wp:featuredmedia'},
        headers={'User-Agent': USER_AGENT},
        timeout=90,  # theracingbiz.com routinely takes ~30s per page
    )
    if resp.status_code == 400:  # past the last page
        return []
    resp.raise_for_status()
    return resp.json()


def insert_backfill_item(db: Database, source: str, fields: dict, tags: list[dict]) -> bool:
    row = {'title': fields['title'], 'url': fields['url'], 'source': source}
    for key in ('snippet', 'image_url', 'published_at'):
        if fields.get(key):
            row[key] = fields[key]
    try:
        resp = db.client.from_('news_items').insert(row).execute()
        item_id = resp.data[0]['id']
        db.client.from_('news_item_tags').insert(
            [{**t, 'news_item_id': item_id} for t in tags]
        ).execute()
        return True
    except Exception as exc:
        print(f'  ERROR inserting "{row["title"][:60]}": {exc}')
        return False


def main():
    ap = argparse.ArgumentParser(description='Backfill news from WordPress archives')
    ap.add_argument('--dry-run', action='store_true', help='print matches, no DB writes')
    ap.add_argument('--since', default='2026-01-01', help='walk archives back to this date (YYYY-MM-DD)')
    ap.add_argument('--max-pages', type=int, default=60, help='safety cap on pages per source')
    args = ap.parse_args()

    cutoff = datetime.strptime(args.since, '%Y-%m-%d').replace(tzinfo=timezone.utc)

    db = Database()
    matcher = load_matcher(db)
    stallion_matcher = load_stallion_matcher(db)
    print(f'Matcher loaded: {matcher.eligible_count} eligible progeny names, '
          f'{stallion_matcher.eligible_count} stallion names')
    print(f'Walking archives back to {args.since}\n')

    counts = {'scanned': 0, 'matched': 0, 'inserted': 0, 'duplicate': 0, 'error': 0}

    for source, api_url in SOURCES:
        print(f'{source} — {api_url}')
        matched = []
        for page in range(1, args.max_pages + 1):
            try:
                posts = fetch_page(api_url, page)
            except requests.RequestException as exc:
                print(f'  WARN page {page}: {exc}')
                break
            if not posts:
                break

            oldest = None
            for post in posts:
                counts['scanned'] += 1
                fields = post_fields(post)
                if not fields['url'] or not fields['title']:
                    continue
                if fields['published_at']:
                    oldest = datetime.fromisoformat(fields['published_at'])
                text = f"{fields['title']} {fields['snippet']}"
                tags, via = build_tags(matcher, stallion_matcher, fields['title'], text)
                if tags:
                    counts['matched'] += 1
                    matched.append((fields, tags, via))

            if oldest and oldest < cutoff:
                print(f'  reached cutoff on page {page} ({oldest.date()})')
                break
            time.sleep(PAGE_PAUSE_SECONDS)

        print(f'  {len(matched)} matched articles')

        if args.dry_run:
            for fields, tags, via in matched:
                date = (fields['published_at'] or '')[:10]
                print(f'  DRY  [{date}] "{fields["title"][:65]}" — via {via}')
            continue

        dupes = existing_urls(db, [f['url'] for f, _, _ in matched])
        for fields, tags, via in matched:
            if fields['url'] in dupes:
                counts['duplicate'] += 1
                continue
            if insert_backfill_item(db, source, fields, tags):
                counts['inserted'] += 1
                print(f'  NEW  [{(fields["published_at"] or "")[:10]}] "{fields["title"][:65]}" — via {via}')
            else:
                counts['error'] += 1

    print(f'\nDone: {counts}')
    if counts['error']:
        sys.exit(1)


if __name__ == '__main__':
    main()
