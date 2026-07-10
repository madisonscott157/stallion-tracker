"""Validated matching of Equibase links found in untrusted email HTML.

Notification emails are attacker-influenceable, so before we fetch a link
(chart PDFs) or store it as a horse's profile URL, we must confirm its *host*
is really equibase.com. A substring regex on the href is not enough — it also
matches ``https://evil.example/equibase.com/static/chart/pdf/x.pdf`` and
``https://evil.example/redir?u=https://equibase.com/...``, which would point the
scraper at an arbitrary server.
"""

from typing import Callable, Optional
from urllib.parse import urlparse

_EQUIBASE_HOSTS = {"equibase.com", "www.equibase.com"}


def is_equibase_url(url: Optional[str], path_prefix: str = "") -> bool:
    """Return True iff ``url`` is an absolute http(s) URL whose host is
    equibase.com and whose path starts with ``path_prefix``."""
    if not url or not isinstance(url, str):
        return False
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    if (parsed.hostname or "").lower() not in _EQUIBASE_HOSTS:
        return False
    return parsed.path.startswith(path_prefix)


def equibase_href(path_prefix: str = "") -> Callable[[Optional[str]], bool]:
    """Predicate for BeautifulSoup's ``href=`` filter that matches only genuine
    equibase.com links under ``path_prefix``."""
    def _match(href: Optional[str]) -> bool:
        return is_equibase_url(href, path_prefix)
    return _match
