#!/usr/bin/env python3
"""Dry-run test harness for the Arion email parsers.

Usage:
    # Save the 6 sample Arion emails to parser/fixtures/arion/ as .eml files
    # (Gmail: More → Download message). Then:
    python scripts/test_arion.py

Prints what would be inserted without touching the database. Useful before
flipping the parser on in production so you can eyeball rows for the
correct currency, country, grade, race_type, and position/finish_status
for DNF cases.
"""

import email
import sys
from email.header import decode_header
from pathlib import Path

# Allow `python scripts/test_arion.py` from parser/ to import siblings.
HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))

from email_parser import detect_email_type  # noqa: E402
from parsers.arion_entry_parser import parse_arion_entry_email  # noqa: E402
from parsers.arion_result_parser import parse_arion_result_email  # noqa: E402

TRACKED_SIRES = {'lope de vega', 'hello youmzain'}
FIXTURES_DIR = HERE / 'fixtures' / 'arion'


def _decode(header: str) -> str:
    if not header:
        return ''
    out = []
    for part, enc in decode_header(header):
        out.append(part.decode(enc or 'utf-8', errors='replace') if isinstance(part, bytes) else part)
    return ''.join(out)


def _extract_html_body(msg: email.message.Message) -> str:
    """Walk the email and return the first text/html payload (decoded)."""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == 'text/html':
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or 'utf-8'
                    return payload.decode(charset, errors='replace')
    elif msg.get_content_type() == 'text/html':
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or 'utf-8'
            return payload.decode(charset, errors='replace')
    return ''


def _render_entry(e, idx: int) -> str:
    h = e.horse
    return (
        f"  [{idx:>2}] {h.name} ({h.country}) {h.yob} {h.sex}  by {h.sire}\n"
        f"       {e.race_date} {e.post_time} {e.timezone}  "
        f"{e.race_country} · {e.track} R{e.race_number}\n"
        f"       {e.race_type} "
        f"{e.stakes_grade or ''}  "
        f"{e.purse_currency} {e.purse}  {e.distance}  "
        f"{e.race_name}\n"
        f"       trainer: {e.trainer}"
    )


def _render_result(r, idx: int) -> str:
    h = r.horse
    pos = r.finish_position if r.finish_position else r.finish_status
    return (
        f"  [{idx:>2}] {h.name} ({h.country}) {h.yob} {h.sex}  by {h.sire}\n"
        f"       {r.race_date} finish={pos}  "
        f"{r.stakes_grade or ''}  "
        f"purse={r.purse_currency} {r.purse}  "
        f"dist={r.distance}  earn={r.earnings_currency} {r.earnings}\n"
        f"       track=<{r.track}> R{r.race_number} race_name=<{r.race_name}>  "
        f"(resolved downstream from entry)\n"
        f"       trainer: {r.trainer}"
    )


def main():
    if not FIXTURES_DIR.exists():
        print(f"Create {FIXTURES_DIR} and drop Arion .eml files there.")
        sys.exit(1)

    eml_files = sorted(FIXTURES_DIR.glob('*.eml'))
    if not eml_files:
        print(f"No .eml files in {FIXTURES_DIR}.")
        sys.exit(1)

    for path in eml_files:
        with path.open('rb') as f:
            msg = email.message_from_bytes(f.read())

        subject = _decode(msg['Subject'])
        html_body = _extract_html_body(msg)
        kind = detect_email_type(html_body)

        print(f"\n{'=' * 72}")
        print(f"{path.name}")
        print(f"  Subject: {subject}")
        print(f"  Kind:    {kind}")
        print('-' * 72)

        if kind == 'arion_entry':
            rows = parse_arion_entry_email(html_body, msg['Message-ID'] or '', subject, TRACKED_SIRES)
            print(f"  Parsed {len(rows)} entry row(s):")
            for i, r in enumerate(rows, 1):
                print(_render_entry(r, i))
        elif kind == 'arion_result':
            rows = parse_arion_result_email(html_body, msg['Message-ID'] or '', subject, TRACKED_SIRES)
            print(f"  Parsed {len(rows)} result row(s):")
            for i, r in enumerate(rows, 1):
                print(_render_result(r, i))
        elif kind == 'arion_trial':
            print("  (trials are skipped by policy — no parser run)")
        else:
            print(f"  (unexpected kind: {kind})")


if __name__ == '__main__':
    main()
