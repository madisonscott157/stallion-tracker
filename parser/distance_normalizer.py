"""Normalize verbose race distance text to compact display format.

Examples:
    "Six And One Half Furlongs" → "6.5F"
    "One Mile And Seventy Yards" → "1 mile 70 yds"
    "About Five And One Half Furlongs" → "About 5.5F"
    "Seven Furlongs" → "7F"
    "One And One Sixteenth Miles" → "1 1/16 miles"
"""

import re
from typing import Optional


# Word-to-number mapping
WORD_NUMBERS = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'eleven': 11, 'twelve': 12, 'thirteen': 13,
    'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
    'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90,
}

# Fraction words to decimal/display values
FRACTIONS = {
    'half': (0.5, '1/2'),
    'quarter': (0.25, '1/4'),
    'eighth': (0.125, '1/8'),
    'sixteenth': (0.0625, '1/16'),
    'three quarters': (0.75, '3/4'),
    'three eighths': (0.375, '3/8'),
    'five eighths': (0.625, '5/8'),
    'seven eighths': (0.875, '7/8'),
    'three sixteenths': (0.1875, '3/16'),
    'five sixteenths': (0.3125, '5/16'),
}

# Also handle "one half", "one quarter", etc.
FRACTIONS['one half'] = FRACTIONS['half']
FRACTIONS['one quarter'] = FRACTIONS['quarter']
FRACTIONS['one eighth'] = FRACTIONS['eighth']
FRACTIONS['one sixteenth'] = FRACTIONS['sixteenth']
FRACTIONS['a half'] = FRACTIONS['half']
FRACTIONS['fourth'] = FRACTIONS['quarter']
FRACTIONS['one fourth'] = FRACTIONS['quarter']
FRACTIONS['three fourth'] = FRACTIONS['three quarters']
FRACTIONS['three fourths'] = FRACTIONS['three quarters']


def _word_to_number(word: str) -> Optional[int]:
    """Convert a number word or compound like 'seventy' to int."""
    word = word.lower().strip()
    if word in WORD_NUMBERS:
        return WORD_NUMBERS[word]

    # Handle compounds: "twenty one" → 21
    parts = re.split(r'[\s-]+', word)
    if len(parts) == 2:
        tens = WORD_NUMBERS.get(parts[0])
        ones = WORD_NUMBERS.get(parts[1])
        if tens and ones and tens >= 20:
            return tens + ones

    return None


def _parse_fraction(text: str) -> Optional[tuple[float, str]]:
    """Parse a fraction phrase, returning (decimal, display) or None."""
    text = text.lower().strip()
    for phrase, values in FRACTIONS.items():
        if text == phrase:
            return values
    return None


def normalize_distance(raw: str) -> str:
    """Normalize a verbose distance string to compact format.

    Args:
        raw: Distance text like "Six And One Half Furlongs"

    Returns:
        Compact format like "6.5F"
    """
    if not raw:
        return raw

    text = raw.strip()

    # Already compact (starts with digit) — leave it alone
    if re.match(r'^\d', text):
        return text

    # Strip surface suffixes that may be concatenated
    text = re.sub(
        r'\s*On\s*The\s*(Turf|Dirt|Main\s*Track|All\s*Weather(?:\s*Track)?)\s*$',
        '', text, flags=re.IGNORECASE
    )

    # Separate concatenated words: "SeventyYards" → "Seventy Yards"
    text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)

    # Clean up extra spaces
    text = ' '.join(text.split())

    # Check for "About" prefix
    about = ''
    about_match = re.match(r'^(About)\s+', text, re.IGNORECASE)
    if about_match:
        about = 'About '
        text = text[about_match.end():]

    # Pattern: "{Number} {And {Fraction}} {Unit} {And {Number} {Unit}}"
    # e.g. "One Mile And Seventy Yards"
    # e.g. "Six And One Half Furlongs"
    # e.g. "One And One Sixteenth Miles"

    # Try compound distance: "{Primary} And {Secondary Yards}"
    compound_match = re.match(
        r'(.+?)\s+(?:Miles?|Furlongs?)\s+And\s+(.+?)\s+(Yards?)\s*$',
        text, re.IGNORECASE
    )
    if compound_match:
        primary_text = compound_match.group(1) + ' ' + re.search(r'(Miles?|Furlongs?)', text, re.IGNORECASE).group(1)
        secondary_num_text = compound_match.group(2)
        secondary_unit = compound_match.group(3)

        primary = _normalize_simple(primary_text)
        sec_num = _word_to_number(secondary_num_text)
        if sec_num is not None:
            sec_unit = 'yds' if secondary_unit.lower().startswith('yard') else secondary_unit
            return f"{about}{primary} {sec_num} {sec_unit}"
        else:
            return f"{about}{primary} {secondary_num_text} {secondary_unit}"

    # Simple distance: "{Number} {And {Fraction}} {Unit}"
    result = _normalize_simple(text)
    return f"{about}{result}"


def _normalize_simple(text: str) -> str:
    """Normalize a simple distance (no compound yards)."""
    text = text.strip()

    # Extract unit
    unit_match = re.search(r'(Furlongs?|Miles?)\s*$', text, re.IGNORECASE)
    if not unit_match:
        return text  # Can't parse, return as-is

    unit_raw = unit_match.group(1).lower()
    body = text[:unit_match.start()].strip()

    # Determine compact unit
    is_furlong = unit_raw.startswith('furlong')

    # Check for "And {fraction}" in body
    fraction_decimal = 0.0
    fraction_display = ''
    and_match = re.search(r'\s+And\s+(.+)$', body, re.IGNORECASE)
    if and_match:
        frac_text = and_match.group(1).strip()
        frac_result = _parse_fraction(frac_text)
        if frac_result:
            fraction_decimal, fraction_display = frac_result
            body = body[:and_match.start()].strip()

    # Convert primary number word to digit
    primary_num = _word_to_number(body)

    if primary_num is not None:
        total = primary_num + fraction_decimal

        if is_furlong:
            # Furlongs: use decimal notation + "F"
            if fraction_decimal == 0:
                return f"{primary_num}F"
            # Use clean decimal: 6.5F not 6.500F
            formatted = f"{total:g}"
            return f"{formatted}F"
        else:
            # Miles: "1 mile", "1 1/16 miles"
            unit_label = 'mile' if total == 1 and not fraction_display else 'miles'
            if fraction_decimal == 0:
                return f"{primary_num} {unit_label}"
            return f"{primary_num} {fraction_display} {unit_label}"
    else:
        # Couldn't parse the number word — return cleaned-up version
        if is_furlong:
            return f"{body} {fraction_display} F".strip() if fraction_display else f"{body}F"
        unit_label = 'mile' if not fraction_display else 'miles'
        return f"{body} {fraction_display} {unit_label}".strip()


if __name__ == '__main__':
    test_cases = [
        ("Six And One Half Furlongs", "6.5F"),
        ("One Mile And Seventy Yards", "1 mile 70 yds"),
        ("Seven Furlongs", "7F"),
        ("Six Furlongs", "6F"),
        ("Five And One Half Furlongs", "5.5F"),
        ("One And One Sixteenth Miles", "1 1/16 miles"),
        ("One And One Eighth Miles", "1 1/8 miles"),
        ("One And Three Sixteenths Miles", "1 3/16 miles"),
        ("About Five And One Half Furlongs", "About 5.5F"),
        ("One Mile", "1 mile"),
        ("Four Furlongs", "4F"),
        ("One And One Quarter Miles", "1 1/4 miles"),
        ("Six And One Half FurlongsOnTheAllWeather", "6.5F"),
        ("One Mile And SeventyYards", "1 mile 70 yds"),
    ]

    for raw, expected in test_cases:
        result = normalize_distance(raw)
        status = "OK" if result == expected else f"FAIL (expected {expected})"
        print(f"  {raw:50s} → {result:20s} {status}")
