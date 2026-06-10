#!/usr/bin/env python3
"""
Stallion Progeny Tracker - Daily Digest Generator

Generates and sends the daily email digest with today's entries
and yesterday's results.

Usage:
    python generate_digest.py              # Send digest
    python generate_digest.py --preview    # Preview HTML without sending
    python generate_digest.py --dry-run    # Show what would be sent
"""

import os
import sys
import argparse
from datetime import date, timedelta
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client
from jinja2 import Environment, FileSystemLoader

load_dotenv()

# Initialize Supabase client
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY')
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Initialize Jinja2 template environment
template_dir = os.path.join(os.path.dirname(__file__), 'templates')
jinja_env = Environment(loader=FileSystemLoader(template_dir))


def get_entries_for_date(stallion: str, target_date: date) -> list:
    """Get all entries for a specific date."""
    result = supabase.table('entries') \
        .select('''
            *,
            horses!inner(name, sex, yob, dam, is_unnamed, stallions!inner(name))
        ''') \
        .eq('race_date', target_date.isoformat()) \
        .eq('scratched', False) \
        .execute()

    entries = []
    for row in result.data:
        horse = row.get('horses', {})
        stallion_data = horse.get('stallions', {})

        # Filter by stallion name
        if stallion_data.get('name', '').lower() != stallion.lower():
            continue

        # Digests never include claiming races (explicit CLM/MCL only —
        # untagged races pass, AOC counts as allowance, same as the web)
        if row.get('race_type') in ('CLM', 'MCL'):
            continue

        entries.append({
            'id': row['id'],
            'horse_name': horse.get('name') or f"Unnamed ({horse.get('dam')})",
            'sex': horse.get('sex'),
            'yob': horse.get('yob'),
            'is_unnamed': horse.get('is_unnamed', False),
            'race_date': row['race_date'],
            'post_time': row.get('post_time'),
            'timezone': row.get('timezone', 'ET'),
            'track': row['track'],
            'race_number': row['race_number'],
            'race_type': row.get('race_type'),
            'race_name': row.get('race_name'),
            'is_stakes': row.get('is_stakes', False),
            'stakes_grade': row.get('stakes_grade'),
            'purse': row.get('purse'),
            'distance': row.get('distance'),
            'surface': row.get('surface'),
            'jockey': row.get('jockey'),
            'trainer': row.get('trainer'),
            'morning_line': row.get('morning_line'),
            'post_position': row.get('post_position'),
        })

    # Sort by post time, stakes first
    entries.sort(key=lambda x: (not x['is_stakes'], x.get('post_time') or ''))
    return entries


def get_results_for_date(stallion: str, target_date: date) -> list:
    """Get all results for a specific date."""
    result = supabase.table('results') \
        .select('''
            *,
            horses!inner(name, sex, yob, dam, stallions!inner(name))
        ''') \
        .eq('race_date', target_date.isoformat()) \
        .execute()

    results = []
    for row in result.data:
        horse = row.get('horses', {})
        stallion_data = horse.get('stallions', {})

        # Filter by stallion name
        if stallion_data.get('name', '').lower() != stallion.lower():
            continue

        # Digests never include claiming races (explicit CLM/MCL only —
        # untagged races pass, AOC counts as allowance, same as the web)
        if row.get('race_type') in ('CLM', 'MCL'):
            continue

        results.append({
            'id': row['id'],
            'horse_name': horse.get('name') or 'Unknown',
            'sex': horse.get('sex'),
            'yob': horse.get('yob'),
            'race_date': row['race_date'],
            'track': row['track'],
            'race_number': row['race_number'],
            'race_type': row.get('race_type'),
            'race_name': row.get('race_name'),
            'is_stakes': row.get('is_stakes', False),
            'stakes_grade': row.get('stakes_grade'),
            'purse': row.get('purse'),
            'finish_position': row['finish_position'],
            'beaten_lengths': row.get('beaten_lengths'),
            'win_margin': row.get('win_margin'),
            'odds': row.get('odds'),
            'chart_url': row.get('chart_url'),
        })

    # Sort by finish position (winners first), then stakes
    results.sort(key=lambda x: (x['finish_position'], not x['is_stakes']))
    return results


def get_news_for_stallion(stallion: str, since: date) -> list:
    """Important news for a stallion since a date: articles where one of
    the stallion's horses (or the stallion itself) is the headline
    subject, plus admin-posted links. Passing mentions are excluded —
    the email only carries what's worth interrupting someone for."""
    stallion_row = supabase.table('stallions') \
        .select('id') \
        .ilike('name', stallion) \
        .execute()
    if not stallion_row.data:
        return []
    stallion_id = stallion_row.data[0]['id']

    rows = supabase.table('news_item_tags') \
        .select('''
            in_headline,
            horses(name),
            news_items!inner(id, title, url, source, snippet, published_at, posted_by)
        ''') \
        .eq('stallion_id', stallion_id) \
        .execute()

    news = []
    seen = set()
    for row in rows.data or []:
        item = row.get('news_items') or {}
        if not item or item['id'] in seen:
            continue
        if not (row.get('in_headline') or item.get('posted_by')):
            continue
        published = (item.get('published_at') or '')[:10]
        if not published or published < since.isoformat():
            continue
        seen.add(item['id'])
        horse = row.get('horses') or {}
        news.append({
            'title': item['title'],
            'url': item['url'],
            'source': item['source'],
            'snippet': item.get('snippet'),
            'horse_name': horse.get('name'),
            'published': published,
            'is_posted': bool(item.get('posted_by')),
        })

    news.sort(key=lambda x: x['published'], reverse=True)
    return news


def get_ytd_stats(stallion: str) -> dict:
    """Get year-to-date statistics for a stallion."""
    result = supabase.table('stallion_ytd_stats') \
        .select('*') \
        .ilike('stallion_name', stallion) \
        .execute()

    if result.data:
        return result.data[0]

    return {
        'starters': 0,
        'winners': 0,
        'win_pct': 0,
        'stakes_winners': 0,
        'total_earnings': 0,
    }


def format_horse_desc(sex: Optional[str], yob: Optional[int]) -> str:
    """Format horse description like 'c, 3'."""
    current_year = date.today().year
    parts = []
    if sex:
        parts.append(sex.lower())
    if yob:
        parts.append(str(current_year - yob))
    return ', '.join(parts)


def format_money(amount: int) -> str:
    """Format money amount."""
    if amount >= 1000000:
        return f"${amount / 1000000:.1f}M"
    if amount >= 1000:
        return f"${amount // 1000}K"
    return f"${amount:,}"


def format_ordinal(n: int) -> str:
    """Format number as ordinal (1st, 2nd, 3rd, etc.)."""
    if 10 <= n % 100 <= 20:
        suffix = 'th'
    else:
        suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f"{n}{suffix}"


def generate_digest_html(stallion: str, digest_date: date,
                         entries_today: list, entries_tomorrow: list,
                         results_yesterday: list, stats: dict,
                         news: list) -> str:
    """Generate the HTML content for the digest email."""
    template = jinja_env.get_template('digest.html')

    return template.render(
        stallion=stallion.upper(),
        date=digest_date.strftime('%B %d, %Y'),
        year=digest_date.year,
        entries_today=entries_today,
        entries_tomorrow=entries_tomorrow,
        results_yesterday=results_yesterday,
        stats=stats,
        news=news,
        format_horse_desc=format_horse_desc,
        format_money=format_money,
        format_ordinal=format_ordinal,
    )


def send_digest(html_content: str, stallion: str, digest_date: date, recipients: list[str]):
    """Send the digest email via Resend."""
    import resend

    resend.api_key = os.environ.get('RESEND_API_KEY')

    subject = f"{stallion.upper()} Progeny Report - {digest_date.strftime('%B %d, %Y')}"

    try:
        resend.Emails.send({
            'from': 'Stallion Tracker <digest@stalliontracker.com>',
            'to': recipients,
            'subject': subject,
            'html': html_content,
        })
        print(f"Digest sent to {len(recipients)} recipients")
        return True
    except Exception as e:
        print(f"Error sending digest: {e}")
        return False


def log_digest(stallion_id: str, recipients: list[str],
               entries_count: int, results_count: int, digest_date: date):
    """Log the digest send to database."""
    supabase.table('digest_log').insert({
        'stallion_id': stallion_id,
        'recipient_emails': recipients,
        'entries_count': entries_count,
        'results_count': results_count,
        'digest_date': digest_date.isoformat(),
    }).execute()


def main():
    parser = argparse.ArgumentParser(description='Generate and send daily digest')
    parser.add_argument('--preview', action='store_true',
                       help='Output HTML to stdout instead of sending')
    parser.add_argument('--dry-run', action='store_true',
                       help='Show what would be sent without sending')
    parser.add_argument('--stallion', type=str,
                       default=os.environ.get('DEFAULT_STALLION', 'McKinzie'),
                       help='Stallion name to generate digest for')
    parser.add_argument('--news-days', type=int, default=2,
                       help='Include headline news from the last N days (default 2)')
    args = parser.parse_args()

    stallion = args.stallion
    today = date.today()
    yesterday = today - timedelta(days=1)
    tomorrow = today + timedelta(days=1)

    # Status goes to stderr so `--preview > digest.html` stays clean
    log = lambda msg: print(msg, file=sys.stderr)
    log(f"Generating digest for {stallion}...")

    # Fetch data
    entries_today = get_entries_for_date(stallion, today)
    entries_tomorrow = get_entries_for_date(stallion, tomorrow)
    results_yesterday = get_results_for_date(stallion, yesterday)
    stats = get_ytd_stats(stallion)
    news = get_news_for_stallion(stallion, today - timedelta(days=args.news_days))

    log(f"  Today's entries: {len(entries_today)}")
    log(f"  Tomorrow's entries: {len(entries_tomorrow)}")
    log(f"  Yesterday's results: {len(results_yesterday)}")
    log(f"  News (last {args.news_days} days): {len(news)}")

    # Skip if nothing to report
    if not entries_today and not results_yesterday and not news:
        log("No entries, results, or news to report. Skipping digest.")
        return

    # Generate HTML
    html = generate_digest_html(
        stallion=stallion,
        digest_date=today,
        entries_today=entries_today,
        entries_tomorrow=entries_tomorrow,
        results_yesterday=results_yesterday,
        stats=stats,
        news=news,
    )

    if args.preview:
        print(html)
        return

    recipients = os.environ.get('DIGEST_RECIPIENTS', '').split(',')
    recipients = [r.strip() for r in recipients if r.strip()]

    if not recipients:
        print("No recipients configured. Set DIGEST_RECIPIENTS env var.")
        return

    if args.dry_run:
        print(f"\nWould send digest to: {recipients}")
        print(f"Subject: {stallion.upper()} Progeny Report - {today.strftime('%B %d, %Y')}")
        return

    # Send email
    success = send_digest(html, stallion, today, recipients)

    if success:
        # Log to database
        # Get stallion ID
        stallion_result = supabase.table('stallions') \
            .select('id') \
            .ilike('name', stallion) \
            .execute()

        if stallion_result.data:
            log_digest(
                stallion_id=stallion_result.data[0]['id'],
                recipients=recipients,
                entries_count=len(entries_today),
                results_count=len(results_yesterday),
                digest_date=today,
            )


if __name__ == '__main__':
    main()
