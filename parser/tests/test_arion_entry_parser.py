"""Tests for the Arion acceptances parser country-section state machine.

Regression for the 2026-08 duplicate-cards incident: Arion writes the US
section header as 'U.S.A.' (periods), which wasn't in any country set, so
it fell through to the track-header heuristic — every US race was ingested
under the preceding country (France / Great Britain) with CET/BST times,
duplicating the Equibase rows whose track spellings never match Arion's.
"""

from parsers.arion_entry_parser import parse_arion_entry_email

TRACKED = {'lope de vega', 'good magic', 'olympiad'}


def _email(*sections: str) -> str:
    return '<html><body>' + '<br/>'.join(sections) + '</body></html>'


BODY = _email(
    '26/08/2026',
    'Australia',
    'BRC',
    '12:33 Race 1 Become a Member Maiden P., A$40000 1350m',
    'San Jeronimo (AUS) 2021 (G. by Lope de Vega-Vintage Folly) (trainer: L M-S)',
    'Chile',
    'Valparaíso',
    '18:00 Race 10 Clasico Aniversario, C$3375000 1100m',
    'Raiko (CHI) 2020 (C. by Good Magic-Escape Act) (trainer: Luis Salinas T.)',
    'France',
    'La Teste-Bassin Arcachon',
    '17:30 Race 3 Prix Millkom L, €50300 1600m',
    'Kozlovskha (IRE) 2023 (F. by Lope de Vega-Rose et Or) (trainer: Y. Barberot (s))',
    'U.S.A.',
    'Parx Racing',
    '13:34 Race 3 Maiden Specialweight, US$50000 1200m',
    "Buster's Beauty (USA) 2023 (F. by Good Magic-Potesta) (trainer: Amelia Green)",
    'Great Britain',
    'Catterick',
    '14:15 Race 4 Yorkshire Dales 2yo Maiden S., £10000 1006m',
    'Shaniko (GB) 2024 (F. by Lope de Vega-Vigogne) (trainer: Craig Lidster)',
)


def test_usa_section_is_dropped_not_treated_as_track():
    rows = parse_arion_entry_email(BODY, 'msg-1', 'Race Acceptances', TRACKED)
    names = {r.horse.name for r in rows}
    # France + Great Britain kept
    assert names == {'Kozlovskha', 'Shaniko'}
    # The US race must NOT leak in under France's country/timezone
    assert all(r.race_country in ('France', 'Great Britain') for r in rows)
    assert all(r.track not in ('Parx Racing', 'U.S.A.') for r in rows)


def test_excluded_sections_reset_country_state():
    # A Chile section directly after Australia must not inherit any country;
    # a US section after France must not inherit France.
    rows = parse_arion_entry_email(BODY, 'msg-1', 'Race Acceptances', TRACKED)
    tracks = {r.track for r in rows}
    assert tracks == {'La Teste-Bassin Arcachon', 'Catterick'}


def test_arion_track_alias_applied():
    # Arion writes 'Marseille Borely'; canonical (PMU-mapped) is
    # 'Marseille-Borely'. The alias hook must rewrite the track header.
    body = _email(
        '26/08/2026',
        'France',
        'Marseille Borely',
        '14:00 Race 1 Prix Test, €20000 1600m',
        'Kozlovskha (IRE) 2023 (F. by Lope de Vega-Rose et Or) (trainer: Y. B)',
    )
    rows = parse_arion_entry_email(body, 'msg-3', 'Race Acceptances', TRACKED)
    assert [r.track for r in rows] == ['Marseille-Borely']


def test_bare_usa_spelling_also_dropped():
    body = _email(
        '26/08/2026',
        'USA',
        'Saratoga',
        '15:30 Race 5 Maiden Specialweight, US$115000 1700m',
        'Calling Mr. Mo (USA) 2024 (C. by Olympiad-Stormy Tak) (trainer: M C)',
    )
    assert parse_arion_entry_email(body, 'msg-2', 'Race Acceptances', TRACKED) == []
