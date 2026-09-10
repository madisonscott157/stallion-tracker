"""Gmail IMAP client for fetching Virtual Stable emails."""

import os
import imaplib
import email
import re
from email.header import decode_header
from datetime import datetime
from typing import Generator, Optional
from dotenv import load_dotenv

from models import EmailMessage

load_dotenv()


class GmailClient:
    """Gmail IMAP client for fetching Equibase Virtual Stable emails."""

    IMAP_SERVER = "imap.gmail.com"
    IMAP_PORT = 993

    def __init__(self):
        self.user = os.environ.get("GMAIL_USER")
        self.password = os.environ.get("GMAIL_APP_PASSWORD")

        if not self.user or not self.password:
            raise ValueError("GMAIL_USER and GMAIL_APP_PASSWORD must be set")

        self.mail: Optional[imaplib.IMAP4_SSL] = None

    def connect(self):
        """Connect to Gmail IMAP server."""
        self.mail = imaplib.IMAP4_SSL(self.IMAP_SERVER, self.IMAP_PORT)
        self.mail.login(self.user, self.password)
        self.mail.select("INBOX")

    def disconnect(self):
        """Disconnect from Gmail."""
        if self.mail:
            try:
                self.mail.close()
                self.mail.logout()
            except (OSError, imaplib.IMAP4.error):
                pass
            self.mail = None

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.disconnect()

    # Search criteria, shared by the listing and streaming paths.
    EQUIBASE_SEARCH = '(OR FROM "equibase.com" SUBJECT "Notification")'
    ARION_SEARCH = '(FROM "arionpedigrees.co.nz")'

    def list_message_ids(self, search_criteria: str, limit: int = 200,
                         oldest_first: bool = False) -> list[tuple[bytes, str]]:
        """List (imap_id, Message-ID) pairs without downloading message bodies.

        One SEARCH plus one batched header FETCH, so a poll cycle spends two
        round-trips working out what is new instead of re-downloading every
        message it has already processed. `BODY.PEEK` is used deliberately:
        a plain `BODY[]`/`RFC822` fetch sets the Seen flag, and listing must
        not change flags on mail it decides to skip.

        Messages with no Message-ID header fall back to the IMAP id, matching
        `_fetch_email`'s own fallback so dedup keys stay consistent.
        """
        if not self.mail:
            raise RuntimeError("Not connected to Gmail")

        status, messages = self.mail.search(None, search_criteria)
        if status != "OK":
            return []

        email_ids = messages[0].split()
        if not email_ids:
            return []

        # Keep the most recent `limit`, then order as the caller asked.
        email_ids = email_ids[-limit:] if len(email_ids) > limit else email_ids
        ordered = email_ids if oldest_first else list(reversed(email_ids))

        id_set = b','.join(ordered)
        status, data = self.mail.fetch(id_set, "(BODY.PEEK[HEADER.FIELDS (MESSAGE-ID)])")
        if status != "OK":
            return []

        # imaplib returns one tuple per message: (b'<seq> (BODY[...] {n}', b'Message-ID: <..>')
        by_seq: dict[bytes, str] = {}
        for part in data:
            if not isinstance(part, tuple):
                continue
            seq_match = re.match(rb'\s*(\d+)', part[0] or b'')
            if not seq_match:
                continue
            mid_match = re.search(rb'Message-ID:\s*(<[^>]+>)', part[1] or b'', re.IGNORECASE)
            seq = seq_match.group(1)
            by_seq[seq] = mid_match.group(1).decode(errors='replace') if mid_match else seq.decode()

        # Preserve the requested order; skip any id the server did not return.
        return [(eid, by_seq[eid]) for eid in ordered if eid in by_seq]

    def fetch_email(self, email_id: bytes) -> Optional[EmailMessage]:
        """Fetch and parse one message by IMAP id (downloads the full body)."""
        return self._fetch_email(email_id)

    def fetch_equibase_emails(self, limit: int = 200, unseen_only: bool = False) -> Generator[EmailMessage, None, None]:
        """
        Fetch emails from Equibase Virtual Stable.

        Args:
            limit: Maximum number of emails to fetch
            unseen_only: Only fetch unread emails

        Yields:
            EmailMessage objects
        """
        if not self.mail:
            raise RuntimeError("Not connected to Gmail")

        # Search for Equibase emails (direct or forwarded)
        search_criteria = self.EQUIBASE_SEARCH
        if unseen_only:
            search_criteria = f'(UNSEEN {search_criteria})'

        status, messages = self.mail.search(None, search_criteria)

        if status != "OK":
            return

        email_ids = messages[0].split()

        # Get most recent emails first
        email_ids = email_ids[-limit:] if len(email_ids) > limit else email_ids
        email_ids = reversed(email_ids)  # Most recent first

        for email_id in email_ids:
            try:
                msg = self._fetch_email(email_id)
                if msg:
                    yield msg
            except Exception as e:
                print(f"Error fetching email {email_id}: {e}")
                continue

    def fetch_arion_emails(self, limit: int = 200, unseen_only: bool = False,
                           oldest_first: bool = True) -> Generator[EmailMessage, None, None]:
        """
        Fetch emails from Arion Pedigrees Horse Tracker.

        Defaults to oldest-first so daily entry emails are ingested before
        the result email that references them (the parser relies on
        matching entries already being in the DB to backfill track + race
        number on Arion results).
        """
        if not self.mail:
            raise RuntimeError("Not connected to Gmail")

        search_criteria = self.ARION_SEARCH
        if unseen_only:
            search_criteria = f'(UNSEEN {search_criteria})'

        status, messages = self.mail.search(None, search_criteria)
        if status != "OK":
            return

        email_ids = messages[0].split()
        email_ids = email_ids[-limit:] if len(email_ids) > limit else email_ids
        if not oldest_first:
            email_ids = list(reversed(email_ids))

        for email_id in email_ids:
            try:
                msg = self._fetch_email(email_id)
                if msg:
                    yield msg
            except Exception as e:
                print(f"Error fetching Arion email {email_id}: {e}")
                continue

    def _fetch_email(self, email_id: bytes) -> Optional[EmailMessage]:
        """Fetch and parse a single email."""
        status, msg_data = self.mail.fetch(email_id, "(RFC822)")

        if status != "OK":
            return None

        for response_part in msg_data:
            if isinstance(response_part, tuple):
                msg = email.message_from_bytes(response_part[1])

                # Decode subject
                subject = self._decode_header(msg["Subject"])

                # Parse date
                date_str = msg["Date"]
                try:
                    msg_date = email.utils.parsedate_to_datetime(date_str)
                except (ValueError, TypeError):
                    msg_date = datetime.now()

                # Get message ID for deduplication
                message_id = msg["Message-ID"] or email_id.decode()

                # Extract body
                html_body = ""
                text_body = ""

                if msg.is_multipart():
                    for part in msg.walk():
                        content_type = part.get_content_type()
                        try:
                            body = part.get_payload(decode=True)
                            if body:
                                charset = part.get_content_charset() or 'utf-8'
                                body = body.decode(charset, errors='replace')

                                if content_type == "text/html":
                                    html_body = body
                                elif content_type == "text/plain":
                                    text_body = body
                        except (UnicodeDecodeError, LookupError, AttributeError):
                            continue
                else:
                    content_type = msg.get_content_type()
                    body = msg.get_payload(decode=True)
                    if body:
                        charset = msg.get_content_charset() or 'utf-8'
                        body = body.decode(charset, errors='replace')
                        if content_type == "text/html":
                            html_body = body
                        else:
                            text_body = body

                return EmailMessage(
                    id=message_id,
                    subject=subject,
                    date=msg_date,
                    html_body=html_body or text_body,
                    text_body=text_body
                )

        return None

    def _decode_header(self, header: str) -> str:
        """Decode email header value."""
        if not header:
            return ""

        decoded_parts = decode_header(header)
        result = []

        for part, encoding in decoded_parts:
            if isinstance(part, bytes):
                result.append(part.decode(encoding or 'utf-8', errors='replace'))
            else:
                result.append(part)

        return ''.join(result)
