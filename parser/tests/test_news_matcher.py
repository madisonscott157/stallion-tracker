"""Tests for news_matcher progeny-name matching."""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir))

from news_matcher import NewsMatcher, TrackedHorse, acceptable_sire_mention

NO_DICT: set = set()


def horse(hid: str, name: str, sire: str = 's1') -> TrackedHorse:
    return TrackedHorse(id=hid, name=name, sire_id=sire)


def matcher(horses, dictionary_words=NO_DICT) -> NewsMatcher:
    return NewsMatcher(horses, dictionary_words=dictionary_words)


def names(matches):
    return [m.name for m in matches]


class TestMultiWordNames:
    def test_exact_match(self):
        m = matcher([horse('1', 'Seattle Storm')])
        assert names(m.match('Seattle Storm wins the allowance feature')) == ['Seattle Storm']

    def test_case_insensitive(self):
        m = matcher([horse('1', 'Seattle Storm')])
        assert names(m.match('SEATTLE STORM WINS AT SARATOGA')) == ['Seattle Storm']

    def test_no_substring_match(self):
        m = matcher([horse('1', 'Seattle Storm')])
        assert m.match('Seattle Stormont was third') == []

    def test_longest_name_wins(self):
        m = matcher([horse('1', 'Seattle Storm'), horse('2', 'Seattle Storm Cat')])
        matches = m.match('Seattle Storm Cat romps in the nightcap')
        assert names(matches) == ['Seattle Storm Cat']

    def test_punctuation_boundary(self):
        m = matcher([horse('1', 'Seattle Storm')])
        assert names(m.match("Seattle Storm's connections were thrilled")) == ['Seattle Storm']

    def test_dictionary_does_not_gate_multiword(self):
        m = matcher([horse('1', 'Good Magic Show')], dictionary_words={'good', 'magic', 'show'})
        assert m.eligible_count == 1


class TestSingleWordNames:
    def test_registered_capitalization_matches(self):
        m = matcher([horse('1', 'Flightline')])
        assert names(m.match('Flightline returned a winner')) == ['Flightline']

    def test_lowercase_prose_does_not_match(self):
        m = matcher([horse('1', 'Quibble')])
        assert m.match('there is no quibble with the result') == []

    def test_all_caps_prose_does_not_match(self):
        m = matcher([horse('1', 'Quibble')])
        assert m.match('NO QUIBBLE THIS WEEKEND') == []

    def test_dictionary_word_ineligible(self):
        # A horse literally named "Editor" must not match headline words
        m = matcher([horse('1', 'Editor')], dictionary_words={'editor'})
        assert m.eligible_count == 0
        assert m.match('Letter to the Editor: A Day of Firsts') == []

    def test_stoplist_word_ineligible_without_dictionary(self):
        m = matcher([horse('1', 'Twirling')])  # in STOPLIST
        assert m.eligible_count == 0

    def test_not_matched_as_prefix_of_longer_proper_noun(self):
        # "Brilliant" the horse must not match inside "Brilliant Candy" the sire
        m = matcher([horse('1', 'Brilliantine')])
        assert m.match('a filly by Brilliantine Candy out of Gold Dust') == []

    def test_matched_mid_sentence_before_lowercase(self):
        m = matcher([horse('1', 'Brilliantine')])
        assert names(m.match('Brilliantine drew off by daylight')) == ['Brilliantine']

    def test_matched_at_end_of_text(self):
        m = matcher([horse('1', 'Brilliantine')])
        assert names(m.match('the maiden went to Brilliantine')) == ['Brilliantine']

    def test_not_matched_after_capitalized_word(self):
        # Surname pattern: "Eddie Woods" must not match a horse named "Woods"
        m = matcher([horse('1', 'Brilliantine')])
        assert m.match('No Regrets For Eddie Brilliantine At The Sale') == []

    def test_not_matched_after_apostrophe(self):
        # French elision: "Prix d'Ispahan" must not match a horse "Ispahan"
        m = matcher([horse('1', 'Brilliantine')])
        assert m.match("the Prix d'Brilliantine takes centre stage") == []
        assert m.match('the Prix d’Brilliantine takes centre stage') == []


class TestCommonPhraseNames:
    DICT = {'made', 'all', 'first', 'look', 'out', 'of', 'the', 'wood'}

    def test_lowercase_prose_does_not_match(self):
        m = matcher([horse('1', 'Made All')], dictionary_words=self.DICT)
        assert m.match('the winner made all the running at Ascot') == []

    def test_registered_case_matches(self):
        m = matcher([horse('1', 'Made All')], dictionary_words=self.DICT)
        assert names(m.match('Made All impressed on debut at Chantilly')) == ['Made All']

    def test_plural_words_count_as_common(self):
        m = matcher([horse('1', 'Out of the Woods')], dictionary_words=self.DICT)
        assert m.match('connections are not out of the woods yet') == []
        assert names(m.match('Out of the Woods ran a big race')) == ['Out of the Woods']

    def test_distinctive_multiword_still_case_insensitive(self):
        m = matcher([horse('1', 'Chief Wallabee')], dictionary_words=self.DICT | {'chief'})
        assert names(m.match('CHIEF WALLABEE WORKS AT CHURCHILL')) == ['Chief Wallabee']


class TestEligibility:
    def test_short_names_skipped(self):
        m = matcher([horse('1', 'Ace')])
        assert m.eligible_count == 0
        assert m.match('Ace wins again') == []

    def test_empty_and_none_names(self):
        m = matcher([horse('1', ''), horse('2', '   ')])
        assert m.eligible_count == 0
        assert m.match('anything at all') == []

    def test_no_horses(self):
        m = matcher([])
        assert m.match('Seattle Storm wins') == []

    def test_default_dictionary_loads(self):
        # Default construction must not blow up regardless of whether the
        # system dictionary exists on this machine
        m = NewsMatcher([horse('1', 'Seattle Storm')])
        assert m.eligible_count == 1


class TestSireMentionContext:
    """Pedigree-credit context rules for stallion-name matching."""

    def _start(self, text, name):
        return text.index(name)

    def test_prose_mention_acceptable(self):
        text = 'a promising filly by Good Magic debuts Saturday'
        assert acceptable_sire_mention(text, 'Promising Filly Debuts', self._start(text, 'Good Magic'))

    def test_subject_pedigree_credit_acceptable(self):
        title = 'Scottish Lassie Effortlessly Returns to Winning Ways'
        text = f'{title} Scottish Lassie (McKinzie) returned a winner at Belmont'
        assert acceptable_sire_mention(text, title, self._start(text, 'McKinzie'))

    def test_sibling_credit_rejected(self):
        title = "Half-Brother to Chancer McPatrick Lays Down the 'Law' on Debut"
        text = f'{title} a half-brother to MGISW Chancer McPatrick (McKinzie) graduated'
        assert not acceptable_sire_mention(text, title, self._start(text, 'McKinzie'))

    def test_stud_news_credit_rejected(self):
        title = 'Dornoch Represented By First Foal'
        text = f'{title} the first foal for Dornoch (Good Magic) arrived at Daybreak'
        assert not acceptable_sire_mention(text, title, self._start(text, 'Good Magic'))

    def test_mares_in_foal_credit_rejected(self):
        title = 'First Mares In Foal For Goal Oriented, Chancer McPatrick'
        text = f'{title} early books complete for Chancer McPatrick (McKinzie) at Spendthrift'
        assert not acceptable_sire_mention(text, title, self._start(text, 'McKinzie'))

    def test_foal_title_does_not_reject_prose_mention(self):
        # The stallion's own foal news is prose, not a parenthetical credit
        title = 'First Foals Arrive for Mo Donegal'
        text = f'{title} breeders praised the first foals by Mo Donegal this week'
        assert acceptable_sire_mention(text, title, text.index('Mo Donegal', len(title)))

    def test_match_spans_positions(self):
        m = matcher([horse('1', 'Seattle Storm')])
        spans = m.match_spans('early Seattle Storm led')
        assert len(spans) == 1
        h, start, end = spans[0]
        assert h.name == 'Seattle Storm'
        assert 'early Seattle Storm led'[start:end] == 'Seattle Storm'


class TestDedupe:
    def test_repeated_mention_returned_once(self):
        m = matcher([horse('1', 'Seattle Storm')])
        text = 'Seattle Storm led early and Seattle Storm held on'
        assert names(m.match(text)) == ['Seattle Storm']

    def test_multiple_horses_in_order(self):
        m = matcher([horse('1', 'Seattle Storm'), horse('2', 'Bold Venture', 's2')])
        matches = m.match('Bold Venture edged Seattle Storm on the wire')
        assert names(matches) == ['Bold Venture', 'Seattle Storm']

    def test_regex_special_chars_in_name(self):
        m = matcher([horse('1', "Smarty's Wish (GB)")])
        assert names(m.match("Smarty's Wish (GB) scores at Newmarket")) == ["Smarty's Wish (GB)"]
