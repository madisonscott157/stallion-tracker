"""Pydantic models for data validation."""

from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field


class ParsedComments(BaseModel):
    """Parsed data from Virtual Stable comments field."""
    sire: Optional[str] = None
    dam: Optional[str] = None
    yob: Optional[int] = None
    dam_sire: Optional[str] = None
    notes: Optional[str] = None


class HorseData(BaseModel):
    """Horse information extracted from email."""
    name: Optional[str] = None
    sex: Optional[str] = None
    yob: Optional[int] = None
    sire: Optional[str] = None
    dam: Optional[str] = None
    dam_sire: Optional[str] = None
    is_unnamed: bool = False
    equibase_refno: Optional[str] = None
    equibase_profile_url: Optional[str] = None


class EntryData(BaseModel):
    """Race entry data extracted from email."""
    horse: HorseData
    race_date: date
    post_time: Optional[str] = None
    timezone: str = "ET"
    track: str
    track_code: Optional[str] = None
    race_number: int
    race_type: Optional[str] = None
    race_name: Optional[str] = None
    is_stakes: bool = False
    stakes_grade: Optional[str] = None
    purse: Optional[int] = None
    distance: Optional[str] = None
    surface: Optional[str] = None
    conditions: Optional[str] = None
    post_position: Optional[int] = None
    morning_line: Optional[str] = None
    jockey: Optional[str] = None
    trainer: Optional[str] = None
    owner: Optional[str] = None
    weight: Optional[int] = None
    claim_price: Optional[int] = None
    medication: Optional[str] = None
    entries_url: Optional[str] = None
    equibase_email_id: Optional[str] = None
    raw_email_subject: Optional[str] = None


class ResultData(BaseModel):
    """Race result data extracted from email."""
    horse: HorseData
    race_date: date
    track: str
    track_code: Optional[str] = None
    race_number: int
    race_type: Optional[str] = None
    race_name: Optional[str] = None
    is_stakes: bool = False
    stakes_grade: Optional[str] = None
    purse: Optional[int] = None
    distance: Optional[str] = None
    surface: Optional[str] = None
    finish_position: int
    beaten_lengths: Optional[str] = None
    win_margin: Optional[str] = None
    odds: Optional[str] = None
    jockey: Optional[str] = None
    trainer: Optional[str] = None
    owner: Optional[str] = None
    post_position: Optional[int] = None
    chart_url: Optional[str] = None
    replay_url: Optional[str] = None
    equibase_email_id: Optional[str] = None
    raw_email_subject: Optional[str] = None


class WorkoutData(BaseModel):
    """Workout data extracted from email."""
    horse: HorseData
    workout_date: date
    track: str
    distance: Optional[str] = None
    time: Optional[str] = None
    time_note: Optional[str] = None
    track_condition: Optional[str] = None
    surface: Optional[str] = None
    rank_position: Optional[int] = None
    rank_total: Optional[int] = None
    equibase_email_id: Optional[str] = None


class EmailMessage(BaseModel):
    """Represents an email message from Gmail."""
    id: str
    subject: str
    date: datetime
    html_body: str
    text_body: Optional[str] = None
