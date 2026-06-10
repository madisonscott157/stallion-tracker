"""Match tracked progeny names in news article text.

Matching rules, tuned for racing-outlet RSS where horse names appear in
registered capitalization:

- Word-boundary matches only ("Storm" never matches inside "Stormont").
- Multi-word names match case-insensitively — unless every word in the
  name is a common English word ("Made All", "First Look"), in which
  case the registered capitalization is required so racing prose like
  "made all the running" can't match.
- Single-word names are the biggest false-positive surface, so they get
  extra gates:
    1. Skipped entirely when they're ordinary English words (system
       dictionary + STOPLIST) — a 2023 filly named "Editor" cannot be
       matched safely against "Letter to the Editor".
    2. Must appear with the registered capitalization exactly.
    3. Must not be followed or preceded by another capitalized word —
       that's almost always a longer proper noun or a person's name
       ("Twirling" inside "Twirling Candy", "Woods" inside "Eddie
       Woods").
    4. Must not follow an apostrophe (French elision: "Prix d'Ispahan"
       must not match a horse named "Ispahan").
- Names shorter than MIN_NAME_LEN are skipped entirely.
"""

import os
import re
from dataclasses import dataclass
from typing import Optional

MIN_NAME_LEN = 4

DICT_PATH = '/usr/share/dict/words'  # GitHub Actions: installed via wamerican

# Fallback stoplist for common words missing from the system dictionary
# (or when no dictionary is available), plus racing-geography proper nouns
# that appear constantly in race coverage ("made in Scotland from girders").
# Extend as dry-run review surfaces false positives.
STOPLIST = {
    'champion', 'winner', 'classic', 'derby', 'stakes', 'racing',
    'thoroughbred', 'saturday', 'sunday', 'america', 'american',
    'editor', 'twirling', 'weekend', 'preview', 'analysis',
    'scotland', 'ireland', 'england', 'france', 'kentucky', 'florida',
    'saratoga', 'churchill', 'belmont', 'ascot', 'newmarket',
    'chantilly', 'deauville', 'keeneland', 'aqueduct', 'pimlico',
}


def _load_system_dictionary() -> set[str]:
    try:
        with open(DICT_PATH, encoding='utf-8', errors='ignore') as f:
            return {line.strip().lower() for line in f if line.strip()}
    except OSError:
        return set()


_system_dictionary: Optional[set[str]] = None


def default_dictionary() -> set[str]:
    global _system_dictionary
    if _system_dictionary is None:
        _system_dictionary = _load_system_dictionary()
    return _system_dictionary


@dataclass(frozen=True)
class TrackedHorse:
    id: str
    name: str
    sire_id: str


class NewsMatcher:
    """Compiles one alternation regex over all eligible horse names."""

    def __init__(self, horses: list[TrackedHorse], dictionary_words: Optional[set[str]] = None):
        if dictionary_words is None:
            dictionary_words = default_dictionary()

        self._by_lower: dict[str, TrackedHorse] = {}
        self._exact_case_lower: set[str] = set()
        for h in horses:
            name = (h.name or '').strip()
            if len(name) < MIN_NAME_LEN:
                continue
            if ' ' not in name:
                lower = name.lower()
                if lower in STOPLIST or lower in dictionary_words:
                    continue
            elif self._all_common_words(name, dictionary_words):
                self._exact_case_lower.add(name.lower())
            self._by_lower[name.lower()] = TrackedHorse(h.id, name, h.sire_id)

        if self._by_lower:
            # Longest-first so "Seattle Storm Cat" wins over "Seattle Storm"
            alternation = '|'.join(
                re.escape(self._by_lower[k].name)
                for k in sorted(self._by_lower, key=len, reverse=True)
            )
            self._regex: Optional[re.Pattern] = re.compile(
                r'(?<![A-Za-z])(' + alternation + r')(?![A-Za-z])',
                re.IGNORECASE,
            )
        else:
            self._regex = None

    @property
    def eligible_count(self) -> int:
        return len(self._by_lower)

    @staticmethod
    def _all_common_words(name: str, dictionary_words: set[str]) -> bool:
        """True when every word in a multi-word name is an ordinary English
        word (with naive plural handling), making the name matchable as
        everyday prose."""
        words = re.findall(r"[A-Za-z]+", name)
        if not words:
            return False
        return all(
            w.lower() in dictionary_words or w.lower().rstrip('s') in dictionary_words
            for w in words
        )

    @staticmethod
    def _followed_by_capitalized_word(text: str, end: int) -> bool:
        """True when the next word after position `end` starts uppercase —
        i.e. the match is likely part of a longer proper noun."""
        rest = text[end:]
        m = re.match(r"[\s]+([A-Za-z])", rest)
        return bool(m and m.group(1).isupper())

    @staticmethod
    def _preceded_by_capitalized_word(text: str, start: int) -> bool:
        """True when the word right before position `start` starts uppercase —
        i.e. the match is likely a surname or part of a longer proper noun
        ("Eddie Woods")."""
        before = text[:start].rstrip()
        m = re.search(r"([A-Za-z][A-Za-z'’-]*)$", before)
        return bool(m and m.group(1)[0].isupper())

    def match(self, text: str) -> list[TrackedHorse]:
        """Return unique tracked horses mentioned in text, in order found."""
        if not self._regex or not text:
            return []
        seen: set[str] = set()
        out: list[TrackedHorse] = []
        for m in self._regex.finditer(text):
            horse = self._by_lower.get(m.group(1).lower())
            if horse is None or horse.id in seen:
                continue
            if ' ' not in horse.name:
                # Single-word gates: registered capitalization, not part of
                # a longer capitalized phrase, not after an apostrophe
                if m.group(1) != horse.name:
                    continue
                if self._followed_by_capitalized_word(text, m.end()):
                    continue
                if self._preceded_by_capitalized_word(text, m.start()):
                    continue
                if m.start() > 0 and text[m.start() - 1] in "'’":
                    continue
            elif horse.name.lower() in self._exact_case_lower and m.group(1) != horse.name:
                # Common-phrase names ("Made All") need registered case
                continue
            seen.add(horse.id)
            out.append(horse)
        return out
