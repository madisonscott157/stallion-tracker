#!/usr/bin/env python3
"""Reprocess Equibase VS emails whose email_log rows are missing.

Targeted alternative to `main.py --once --limit N` for backfills: the
full sweep does an IMAP fetch (plus a Supabase lookup) for every email
in the mailbox (~15k) just to skip the already-processed ones, and
imaplib without a socket timeout can hang forever on a dropped read.
This script instead:

  1. bulk-loads every logged Message-ID from email_log (paginated),
  2. IMAP-searches only the notification subjects,
  3. downloads Message-ID headers first (cheap) and full bodies only
     for unlogged emails,
  4. processes them through the exact same pipeline as main.py
     (detect_email_type / should_process_email / parse_email /
     process_*), logging to email_log so it is idempotent and
     restartable,
  5. sets a socket timeout and reconnects on IMAP errors.

Usage: python3 parser/scripts/backfill_emails.py [--dry-run]
"""
import email as email_lib
import imaplib
import os
import socket
import sys
import time
from email.utils import parsedate_to_datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), ".env"))

from db import Database
from email_parser import detect_email_type, parse_email, should_process_email
from main import (get_tracked_stallions, process_entry, process_result,
                  process_scratch, process_workout)
from models import (EmailMessage, EntryData, ResultData, ScratchData,
                    WorkoutData)

SUBJECTS = [
    "Final Entry Notification",
    "Race Day Notification",
    "Early Entry Notification",
    "Result Notification",
    "Result Scratch Notification",
]

socket.setdefaulttimeout(60)


def connect():
    m = imaplib.IMAP4_SSL("imap.gmail.com")
    m.login(os.environ["GMAIL_USER"], os.environ["GMAIL_APP_PASSWORD"])
    m.select("INBOX", readonly=True)
    return m


def logged_message_ids(db) -> set:
    ids, off = set(), 0
    while True:
        rows = (db.client.table("email_log").select("email_id")
                .range(off, off + 999).execute().data or [])
        ids.update(r["email_id"] for r in rows if r.get("email_id"))
        if len(rows) < 1000:
            break
        off += 1000
    return ids


def html_and_text(msg):
    html_body = text_body = ""
    for part in msg.walk():
        ct = part.get_content_type()
        if ct not in ("text/html", "text/plain"):
            continue
        body = part.get_payload(decode=True)
        if body is None:
            continue
        body = body.decode(part.get_content_charset() or "utf-8", errors="replace")
        if ct == "text/html":
            html_body = body
        else:
            text_body = body
    return html_body, text_body


def main():
    dry = "--dry-run" in sys.argv
    db = Database()
    tracked = get_tracked_stallions()
    print(f"tracked stallions: {len(tracked)}")
    seen = logged_message_ids(db)
    print(f"already-logged email ids: {len(seen)}")

    m = connect()

    def with_retry(fn):
        nonlocal m
        for attempt in (1, 2, 3, 4):
            try:
                return fn(m)
            except (imaplib.IMAP4.error, OSError) as e:
                print(f"  IMAP error ({e}); reconnect attempt {attempt}")
                time.sleep(10 * attempt)
                try:
                    m.logout()
                except Exception:
                    pass
                m = connect()
        raise RuntimeError("IMAP kept failing after 4 attempts")

    todo = []  # (uid, subject)
    for subj in SUBJECTS:
        typ, data = with_retry(
            lambda mm: mm.search(None, f'(FROM "equibase" SUBJECT "{subj}")'))
        uids = data[0].split()
        # Header pass: find unlogged uids without body downloads, fetching
        # Message-ID headers in batches to keep IMAP round trips low.
        unlogged = 0
        for i in range(0, len(uids), 200):
            chunk = uids[i:i + 200]
            uid_set = b",".join(chunk).decode()
            typ, md = with_retry(lambda mm: mm.fetch(
                uid_set, "(BODY.PEEK[HEADER.FIELDS (MESSAGE-ID)])"))
            # md alternates (b'<uid> (...', b'<header bytes>') tuples with b')'
            k = 0
            for part in md:
                if not isinstance(part, tuple):
                    continue
                raw = (part[1] or b"").decode(errors="replace")
                mid = raw.split(":", 1)[1].strip() if ":" in raw else None
                uid = chunk[k] if k < len(chunk) else None
                k += 1
                if uid is None:
                    continue
                if not mid:
                    mid = uid.decode()
                if mid not in seen:
                    todo.append((uid, subj))
                    unlogged += 1
        print(f"{subj}: {len(uids)} emails, {unlogged} unlogged")
    print(f"TOTAL to process: {len(todo)}")
    if dry:
        return

    ok = err = skip = 0
    for n, (uid, subj) in enumerate(todo, 1):
        for attempt in (1, 2, 3):
            try:
                typ, md = m.fetch(uid, "(RFC822)")
                break
            except (imaplib.IMAP4.error, OSError) as e:
                print(f"  IMAP error ({e}); reconnecting (attempt {attempt})")
                time.sleep(5 * attempt)
                try:
                    m.logout()
                except Exception:
                    pass
                m = connect()
        else:
            err += 1
            continue
        msg = email_lib.message_from_bytes(md[0][1])
        mid = msg.get("Message-ID") or uid.decode()
        if mid in seen:
            continue
        seen.add(mid)
        html_body, text_body = html_and_text(msg)
        try:
            msg_date = parsedate_to_datetime(msg.get("Date"))
        except Exception:
            msg_date = None
        em = EmailMessage(id=mid, subject=msg.get("Subject", "").strip(),
                          date=msg_date, html_body=html_body or text_body,
                          text_body=text_body)
        try:
            email_type = detect_email_type(em.html_body)
            if email_type == "unknown":
                db.log_email(em.id, em.subject, em.date, "unknown",
                             success=False, error_message="Unknown email type")
                err += 1
                continue
            if not should_process_email(em.html_body, tracked):
                db.log_email(em.id, em.subject, em.date, email_type,
                             success=True, error_message="Not a tracked stallion")
                skip += 1
                continue
            parsed = parse_email(em, email_type)
            if not parsed:
                db.log_email(em.id, em.subject, em.date, email_type,
                             success=False, error_message="Failed to parse")
                err += 1
                continue
            success = False
            if email_type == "entry" and isinstance(parsed, EntryData):
                success = process_entry(db, parsed)
            elif email_type == "result" and isinstance(parsed, ResultData):
                success = process_result(db, parsed)
            elif email_type == "workout" and isinstance(parsed, WorkoutData):
                success = process_workout(db, parsed)
            elif email_type == "scratch" and isinstance(parsed, ScratchData):
                success = process_scratch(db, parsed)
            if success:
                db.log_email(em.id, em.subject, em.date, email_type)
                ok += 1
            else:
                db.log_email(em.id, em.subject, em.date, email_type,
                             success=False, error_message="Failed to store")
                err += 1
        except Exception as e:
            print(f"  ERROR on {em.subject!r} {em.date}: {e}")
            err += 1
        if n % 25 == 0:
            print(f"[{n}/{len(todo)}] ok={ok} skip={skip} err={err}")
    print(f"DONE: ok={ok} skipped(untracked)={skip} err={err} of {len(todo)}")


if __name__ == "__main__":
    main()
