"""Gmail IMAP client for fetching Virtual Stable emails."""

import os
import imaplib
import email
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
            except:
                pass
            self.mail = None

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.disconnect()

    def fetch_equibase_emails(self, limit: int = 20, unseen_only: bool = False) -> Generator[EmailMessage, None, None]:
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
        search_criteria = '(OR FROM "equibase.com" SUBJECT "Notification")'
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
                except:
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
                        except:
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
