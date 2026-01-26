"""Email parsers for different notification types."""

from .entry_parser import parse_entry_email
from .result_parser import parse_result_email
from .workout_parser import parse_workout_email

__all__ = ['parse_entry_email', 'parse_result_email', 'parse_workout_email']
