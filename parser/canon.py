"""Shared canonicalization for PMU + Arion ingestion paths.

Centralized so both writers produce identical canonical strings for the
upsert key (horse_id, race_date, track, race_number) and so both write
the same race_country / country / sex enums.
"""

import logging
import re
from datetime import date, datetime
from typing import Optional
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

PARIS = ZoneInfo("Europe/Paris")


# ---------------------------------------------------------------------------
# PMU categorieParticularite → (race_type, stakes_grade)
# ---------------------------------------------------------------------------

PMU_CATEGORY_MAP: dict[str, tuple[str, Optional[str]]] = {
    # Stakes — Arion already maps these; we still write them so a
    # PMU-first row arrives with the right shape.
    "GROUPE_I":   ("STK", "G1"),
    "GROUPE_II":  ("STK", "G2"),
    "GROUPE_III": ("STK", "G3"),
    "LISTED":     ("STK", "Listed"),
    # Handicaps — every handicap flavour collapses to HCP per spec.
    "HANDICAP":                  ("HCP", None),
    "HANDICAP_DIVISE":           ("HCP", None),
    "HANDICAP_DE_CATEGORIE":     ("HCP", None),
    "HANDICAP_CATEGORIE_DIVISE": ("HCP", None),
    "HANDICAP_A_RECLAMER":       ("HCP", None),  # PMU enum found in recon
    # Claimers
    "A_RECLAMER": ("CLM", None),
    # Conditions — caller must run is_french_msw(conditions) to upgrade
    # to MSW where the eligibility says "n'ayant jamais (couru|gagné)".
    "COURSE_A_CONDITIONS":          ("CON", None),
    "COURSE_A_CONDITION_QUALIF_HP": ("CON", None),
    # INCONNU and any unmapped value fall through to ALW + log.
}

# course.statut values that mean "this race exists and matters". Anything
# else (notably COURSE_ANNULEE) is skipped *before* we hit the participants
# endpoint, because PMU still serves participants for cancelled races
# without surfacing the cancellation in the participant payload.
ACCEPTABLE_COURSE_STATUS = {
    "PROGRAMMEE",
    "DEPART_CONFIRME",
    "FIN_COURSE",
    "ARRIVEE_DEFINITIVE",
    "ARRIVEE_DEFINITIVE_COMPLETE",
}


# PMU pays.code allowlist — countries where we ingest PLAT racing.
# FRA gets all PLAT races (Tier 1); every other country in this set
# gets stakes-only (Group I/II/III + Listed), matching the Arion
# NH_COUNTRIES filter rule. Southern Hemisphere (AUS/NZL/ZAF) and
# Latin America (ARG/BRA/CHL/URY) are deliberately omitted — their
# tracked-stallion progeny activity is out of scope for this tracker.
# USA/CAN are also omitted (2026-08-25): Equibase Virtual Stable is the
# source of record there, and PMU's fallback track spellings ("Del-Mar")
# would never match Equibase's ("DEL MAR") in the upsert key — a US
# Group race carried by PMU would land as a duplicate row.
PMU_NH_COUNTRY_CODES = {
    "FRA", "GBR", "IRL",
    "DEU", "ITA", "ESP",
    "QAT", "SAU", "ARE", "BHR",
    "JPN", "HKG", "KOR",
    "TUR",
    "CZE", "HUN", "POL", "SWE", "DNK", "NOR",
    "BEL", "NLD", "CHE", "AUT", "SVK",
    "MAR",
}

# categorieParticularite values that count as stakes. Used to gate
# non-FR PMU ingestion to the "Group + Listed only" tier.
PMU_STAKES_CATEGORIES = {
    "GROUPE_I", "GROUPE_II", "GROUPE_III", "LISTED",
}


def map_pmu_category(category: Optional[str]) -> tuple[str, Optional[str]]:
    """PMU categorieParticularite → (race_type, stakes_grade).
    Unknown values fall through to ('ALW', None) + a warning log."""
    if not category:
        return ("ALW", None)
    if category in PMU_CATEGORY_MAP:
        return PMU_CATEGORY_MAP[category]
    logger.warning("unmapped PMU categorieParticularite=%r → ALW", category)
    return ("ALW", None)


# ---------------------------------------------------------------------------
# MSW detection inside COURSE_A_CONDITIONS / COURSE_A_CONDITION_QUALIF_HP
# Validated to 27/27 precision and recall on a 78-race hand-labeled sample.
# Handles PMU's known text-truncation bug (jamais → jamai, un → u).
# ---------------------------------------------------------------------------

_MSW_CLASS_TAIL = re.compile(
    r"jamai[s]?\s+gagn[ée]\s+("
    r"un[e]?\s+(?:course\s+de\s+)?(?:groupe|listed|classe)|"
    r"u\s+(?:groupe|listed|classe)|"  # PMU truncation 'u Groupe'
    r"de\s+(?:groupe|listed|classe))",
    re.IGNORECASE,
)
_MSW_PAS_DEPUIS = re.compile(
    r"n['\u2019 ]?ayant\s+pas\s+(?:depuis|gagn[ée]\s+depuis)",
    re.IGNORECASE,
)
_MSW_PAS_N_COURSES = re.compile(
    r"n['\u2019 ]?ayant\s+pas\s+gagn[ée]\s+(?:un[e]?|deux|trois|\d+)\s+courses?",
    re.IGNORECASE,
)
_MSW_PRIMARY = re.compile(
    r"n['\u2019 ]?ayant\s+jamai[s]?\s+(?:couru|gagn[ée])",
    re.IGNORECASE,
)
_MSW_CLASS_NAMES = re.compile(
    r"\b(?:in[ée]dit(?:e?s)?|pucelles?)\b",
    re.IGNORECASE,
)


def is_french_msw(conditions: Optional[str]) -> bool:
    """True iff the FR PMU 'conditions' text describes a maiden (MSW) race.

    Strategy: examine only the first sentence (primary eligibility). Reject
    class-restricted 'jamais gagné un Groupe/Listed/Classe' and the
    'pas (depuis|gagné N courses)' restricted-conditions patterns.
    """
    if not conditions:
        return False
    primary = re.split(r"\.\s+(?=[A-ZÉÀ])", conditions, maxsplit=1)[0]
    if _MSW_CLASS_TAIL.search(primary):
        return False
    if _MSW_PAS_N_COURSES.search(primary):
        return False
    if _MSW_PAS_DEPUIS.search(primary):
        return False
    return bool(_MSW_PRIMARY.search(primary) or _MSW_CLASS_NAMES.search(primary))


# ---------------------------------------------------------------------------
# Track names: PMU libelleCourt → DB canonical
# ---------------------------------------------------------------------------

# Hand-mapped: every track currently in the DB's race_country='France' rows
# plus PMU's spelling for the meeting. New tracks should be added here as
# they appear in logs (the fallback warns loudly).
PMU_TRACK_TO_DB: dict[str, str] = {
    "AGEN LA GARENNE":   "Agen-La-Garenne",
    "CHANTILLY":         "Chantilly",
    "LE BOUSCAT":        "Bordeaux-Le Bouscat",
    "LYON-PARILLY":      "Lyon-Parilly",
    "NANCY-BRABOIS":     "Nancy",
    "ParisLongchamp":    "ParisLongchamp",
    "SAINT-CLOUD":       "Saint-Cloud",
    # Tracks currently in the DB that PMU emits in some form but weren't
    # in the recon-sample; mapped defensively so the first hit doesn't
    # produce a fallback dupe.
    "COMPIEGNE":         "Compiegne",
    "FONTAINEBLEAU":     "Fontainebleau",
    "TARBES":            "Tarbes",
    "TOULOUSE":          "Toulouse",
    "VANNES":            "Vannes",
    "LE MANS":           "Le Mans",
    "LE LION D'ANGERS":  "Le Lion-d'Angers",
    # Provincial PMU tracks not yet in DB but seen in recon — preempt the
    # fallback warning. Marseille has two tracks; canonicalize as
    # "Marseille-Borely" / "Marseille-Pont-de-Vivaux" to match French
    # convention.
    "ANGERS":            "Angers",
    "BORELY":            "Marseille-Borely",
    "PONT DE VIVAUX":    "Marseille-Pont-de-Vivaux",
    "DAX":               "Dax",
    "LYON LA SOIE":      "Lyon-La-Soie",
    "NANTES":            "Nantes",
    "NIMES":             "Nimes",
    "SAINT BRIEUC":      "Saint-Brieuc",
    "STRASBOURG":        "Strasbourg",
    "VICHY":             "Vichy",
    # Confirmed against the live PMU programme API 2026-08-25 for the exact
    # meeting dates in the DB. Canonical form must equal Arion's emission
    # for the track, or the two writers never merge in the upsert key.
    "LA TESTE":          "La Teste-Bassin Arcachon",
    "LES SABLES D OLONNE": "Les Sables d'Olonne",
    "LE TOUQUET":        "Le Touquet",
    "MONT DE MARSAN":    "Mont-de-Marsan",
    "EVREUX":            "Evreux-Navarre",
    "LA CEPIERE":        "Toulouse",   # HIPPODROME DE TOULOUSE LA CEPIERE
}


# Arion track spellings that diverge from the canonical DB name (which
# otherwise follows Arion convention). Applied by arion_entry_parser to
# every track header; identity for unknown names. Add entries here when
# a new Arion/PMU spelling pair shows up as a duplicate-entry family.
ARION_TRACK_TO_DB: dict[str, str] = {
    "Marseille Borely": "Marseille-Borely",
}


def arion_track_to_db(track: str) -> str:
    """Arion track header → DB canonical track string."""
    return ARION_TRACK_TO_DB.get(track, track)


def pmu_to_db_track(libelle: str) -> str:
    """PMU hippodrome libelleCourt → DB canonical track string.

    Known tracks are mapped explicitly. Unknown tracks fall through to a
    deterministic Title-Case-Hyphenated form and log a warning so we can
    add an explicit alias later.
    """
    if not libelle:
        return ""
    if libelle in PMU_TRACK_TO_DB:
        return PMU_TRACK_TO_DB[libelle]
    fallback = "-".join(part.capitalize() for part in libelle.split())
    logger.warning("unknown PMU track %r → fallback %r", libelle, fallback)
    return fallback


# ---------------------------------------------------------------------------
# Country codes / names
# ---------------------------------------------------------------------------

# Reunion-level pays.code (ISO 3-letter) → race_country English name
# matching the form Arion writes ("France", "Great Britain", etc.) so
# both writers store the same race_country string.
PMU_PAYS_CODE_TO_RACE_COUNTRY: dict[str, str] = {
    "FRA": "France",
    "GBR": "Great Britain",
    "IRL": "Ireland",
    "USA": "USA",
    "CAN": "Canada",
    "DEU": "Germany",
    "ITA": "Italy",
    "ESP": "Spain",
    "BEL": "Belgium",
    "NLD": "Netherlands",
    "CHE": "Switzerland",
    "AUT": "Austria",
    "POL": "Poland",
    "CZE": "Czech Republic",
    "HUN": "Hungary",
    "SWE": "Sweden",
    "DNK": "Denmark",
    "NOR": "Norway",
    "JPN": "Japan",
    "HKG": "Hong Kong",
    "QAT": "Qatar",
    "ARE": "UAE",
    "BHR": "Bahrain",
    "SAU": "Saudi Arabia",
    "TUR": "Turkey",
    "MAR": "Morocco",
    "AUS": "Australia",
    "NZL": "New Zealand",
    "ZAF": "South Africa",
    "ARG": "Argentina",
    "BRA": "Brazil",
    "CHL": "Chile",
    "URY": "Uruguay",
    "KOR": "South Korea",
}

# Participant-level pays libelle (mixed-case French names; only ~52%
# populated per recon) → 2-3 letter horse country code matching the
# form Arion writes (GB / IRE / FR / GER / USA / etc.).
PMU_PAYS_LIBELLE_TO_HORSE_COUNTRY: dict[str, str] = {
    "France":              "FR",
    "Irlande":             "IRE",
    "Grande-Bretagne":     "GB",
    "Royaume-Uni":         "GB",
    "Allemagne":           "GER",
    "Italie":              "ITY",
    "Espagne":             "SPA",
    "USA":                 "USA",
    "États-Unis":          "USA",
    "Etats-Unis":          "USA",
    "Canada":              "CAN",
    "Belgique":            "BEL",
    "Pays-Bas":            "NLD",
    "Suisse":              "SWI",
    "Autriche":            "AUT",
    "Pologne":             "POL",
    "Suède":               "SWE",
    "Danemark":            "DEN",
    "Norvège":             "NOR",
    "Japon":               "JPN",
    "Hong-Kong":           "HKG",
    "Australie":           "AUS",
    "Nouvelle-Zélande":    "NZ",
    "Argentine":           "ARG",
    "Brésil":              "BRZ",
    "Chili":               "CHI",
    "Uruguay":             "URY",
    "Afrique du Sud":      "SAF",
    "Inconnu":             None,  # explicit unknown
}


def pmu_pays_code_to_race_country(code: Optional[str]) -> Optional[str]:
    """Reunion pays.code → DB race_country (English title-case)."""
    if not code:
        return None
    return PMU_PAYS_CODE_TO_RACE_COUNTRY.get(code.upper())


def pmu_pays_libelle_to_horse_country(libelle: Optional[str]) -> Optional[str]:
    """Participant pays libelle → DB horses.country (2-3 letter code)."""
    if not libelle:
        return None
    return PMU_PAYS_LIBELLE_TO_HORSE_COUNTRY.get(libelle)


# ---------------------------------------------------------------------------
# Sex
# ---------------------------------------------------------------------------

SEX_MAP: dict[str, str] = {
    "MALES":    "c",  # entire male — colt/horse
    "MALE":     "c",
    "FEMELLES": "f",
    "FEMELLE":  "f",
    "HONGRES":  "g",  # gelding
    "HONGRE":   "g",
}


def pmu_sex_to_db(sexe: Optional[str]) -> Optional[str]:
    if not sexe:
        return None
    return SEX_MAP.get(sexe.upper())


# ---------------------------------------------------------------------------
# Sire-name match for tracked-stallion lookup
# ---------------------------------------------------------------------------

def normalize_sire_name(name: Optional[str]) -> str:
    """Lower-case, trim. PMU emits plain-ASCII upper-case names; the
    stallions table uses generated lower-case name_normalized. A simple
    .lower().strip() matches them. Any future diacritic stallion (e.g.
    Almanzor) will need unicodedata.normalize."""
    if not name:
        return ""
    return name.strip().lower()


# ---------------------------------------------------------------------------
# Display-case normalization for PMU's ALL-CAPS strings
# (race names, horse names, dam, sire, jockey, trainer)
# ---------------------------------------------------------------------------

# French articles, prepositions, conjunctions that stay lowercase in the
# middle of a title. First word is always capitalized regardless.
FR_LOWERCASE_WORDS = frozenset({
    "de", "du", "des", "le", "la", "les",
    "un", "une", "au", "aux", "en", "et", "ou",
    "à", "sur", "sous", "par", "pour", "avec", "sans",
})


def title_case_french(text: Optional[str]) -> Optional[str]:
    """French title-case for race / horse / dam / sire names.

    Rule (per French convention, e.g. 'Prix de la Foret'):
      • First word always capitalized.
      • Articles + prepositions in FR_LOWERCASE_WORDS stay lowercase
        when they appear after the first word.
      • Apostrophe-prefixed tokens like 'D'OMBRE' become 'd'Ombre'
        when they aren't the first word, 'D'Ombre' when they are.
      • Other tokens get their first letter capitalized.

    PMU emits everything as ALL CAPS so .title() alone gives 'Prix De
    La Foret'. Equibase / Arion already use Title Case so this function
    is only called from PMU paths.
    """
    if not text:
        return text
    parts = text.split()
    out: list[str] = []
    for i, raw in enumerate(parts):
        # Apostrophe-prefixed: D'OMBRE → d'Ombre / D'Ombre (first word).
        if len(raw) > 2 and raw[1] == "'":
            tail = raw[2:].lower().capitalize()
            head = raw[0].upper() if i == 0 else raw[0].lower()
            token = f"{head}'{tail}"
        else:
            token = raw.lower().capitalize()
        if i > 0 and token.lower() in FR_LOWERCASE_WORDS:
            token = token.lower()
        out.append(token)
    return " ".join(out)


_INITIAL_RE = re.compile(r"^[A-Z]{1,3}\.?$")
_PARENS_QUAL_RE = re.compile(r"^\([A-Za-z]+\)$")
_COUNTRY_SUFFIX_RE = re.compile(r"^(.*?)\s*\(([A-Z]{2,4})\)\s*$")


def split_country_suffix(name: Optional[str]) -> tuple[str, Optional[str]]:
    """Split 'Lope De Vega (IRE)' into ('Lope De Vega', 'IRE'); return
    ('Lope De Vega', None) if there's no suffix.

    The Racing API encodes country of origin / surface marker in
    trailing parens for horses ('Bubbles Wonky (IRE)'), sires
    ('Lope De Vega (IRE)'), and tracks ('Curragh (IRE)', 'Kempton (AW)').
    Same helper handles all three so the value we store / compare
    against matches Arion's no-suffix form.
    """
    if not name:
        return ("", None)
    m = _COUNTRY_SUFFIX_RE.match(name)
    if m:
        return m.group(1).strip(), m.group(2)
    return name.strip(), None


def title_case_person(name: Optional[str]) -> Optional[str]:
    """Format a jockey / trainer name from PMU's compact 'A.LEMAITRE'
    or 'HF.DEVIN (S)' style into 'A. Lemaitre' / 'HF. Devin (S)'.

    Rules:
      • Insert a space after any period that isn't followed by one.
      • Tokens that are 1-3 capital letters (with optional trailing
        period) are preserved as-is — they're initials.
      • Parenthesized qualifiers like '(S)' are preserved verbatim.
      • All other tokens get .capitalize() (first letter up, rest down).
    """
    if not name:
        return name
    s = re.sub(r"\.(?=\S)", ". ", name)
    out: list[str] = []
    for p in s.split():
        if _INITIAL_RE.match(p):
            out.append(p)
        elif _PARENS_QUAL_RE.match(p):
            out.append(p)
        else:
            out.append(p.lower().capitalize())
    return " ".join(out)


# ---------------------------------------------------------------------------
# Date / time conversion from PMU epoch ms
# ---------------------------------------------------------------------------

def pmu_paris_datetime(epoch_ms: int) -> datetime:
    """PMU epoch ms → Europe/Paris-localized datetime.

    Used for both race_date and post_time derivation. heureDepart is the
    canonical source — dateReunion is midnight Paris-local and naive UTC
    conversion gives the wrong calendar day on DST fall-back days.
    """
    return datetime.fromtimestamp(epoch_ms / 1000, tz=PARIS)


def pmu_race_date(epoch_ms: int) -> date:
    """heureDepart epoch ms → Paris-local race date."""
    return pmu_paris_datetime(epoch_ms).date()


def pmu_post_time(epoch_ms: int) -> str:
    """heureDepart epoch ms → 'HH:MM' Paris-local string."""
    return pmu_paris_datetime(epoch_ms).strftime("%H:%M")
