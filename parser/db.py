"""Supabase database client and operations."""

import os
from typing import Optional
from datetime import date
from supabase import create_client, Client
from dotenv import load_dotenv

from models import HorseData, EntryData, ResultData, WorkoutData

load_dotenv()


class Database:
    """Supabase database wrapper."""

    def __init__(self):
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_KEY")

        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")

        self.client: Client = create_client(url, key)
        self._stallion_cache: dict[str, str] = {}  # name -> id

    def get_stallion_id(self, sire_name: str) -> Optional[str]:
        """Get stallion ID by name (case-insensitive)."""
        if not sire_name:
            return None

        normalized = sire_name.lower().strip()

        # Check cache
        if normalized in self._stallion_cache:
            return self._stallion_cache[normalized]

        # Query database
        result = self.client.table("stallions") \
            .select("id") \
            .eq("name_normalized", normalized) \
            .execute()

        if result.data:
            stallion_id = result.data[0]["id"]
            self._stallion_cache[normalized] = stallion_id
            return stallion_id

        return None

    def get_tracked_stallion_names(self) -> list[str]:
        """Get list of all tracked stallion names (normalized)."""
        result = self.client.table("stallions") \
            .select("name_normalized") \
            .execute()

        return [row["name_normalized"] for row in result.data]

    def upsert_horse(self, horse: HorseData, sire_id: str) -> Optional[str]:
        """
        Insert or update a horse record.
        Returns the horse ID.
        """
        # Try to find existing horse
        existing_id = self._find_horse(horse, sire_id)

        if existing_id:
            # Update existing record (e.g., unnamed horse getting named)
            update_data = {
                "updated_at": "now()"
            }

            if horse.name and not horse.is_unnamed:
                update_data["name"] = horse.name
                update_data["is_unnamed"] = False

            if horse.sex:
                update_data["sex"] = horse.sex
            if horse.yob:
                update_data["yob"] = horse.yob
            if horse.equibase_refno:
                update_data["equibase_refno"] = horse.equibase_refno
            if horse.equibase_profile_url:
                update_data["equibase_profile_url"] = horse.equibase_profile_url

            self.client.table("horses") \
                .update(update_data) \
                .eq("id", existing_id) \
                .execute()

            return existing_id

        # Insert new horse
        insert_data = {
            "name": horse.name if horse.name else None,
            "sex": horse.sex,
            "yob": horse.yob,
            "sire_id": sire_id,
            "dam": horse.dam,
            "dam_sire": horse.dam_sire,
            "is_unnamed": horse.is_unnamed,
            "equibase_refno": horse.equibase_refno,
            "equibase_profile_url": horse.equibase_profile_url,
        }

        result = self.client.table("horses") \
            .insert(insert_data) \
            .execute()

        if result.data:
            return result.data[0]["id"]

        return None

    def _find_horse(self, horse: HorseData, sire_id: str) -> Optional[str]:
        """Find existing horse by name+sire or by sire+dam for unnamed."""
        # First try by equibase_refno if available
        if horse.equibase_refno:
            result = self.client.table("horses") \
                .select("id") \
                .eq("equibase_refno", horse.equibase_refno) \
                .execute()
            if result.data:
                return result.data[0]["id"]

        # Try by name + sire
        if horse.name:
            result = self.client.table("horses") \
                .select("id") \
                .eq("name_normalized", horse.name.lower().strip()) \
                .eq("sire_id", sire_id) \
                .execute()
            if result.data:
                return result.data[0]["id"]

        # Try by sire + dam (for unnamed horses or matching)
        if horse.dam:
            result = self.client.table("horses") \
                .select("id") \
                .eq("sire_id", sire_id) \
                .eq("dam_normalized", horse.dam.lower().strip()) \
                .execute()
            if result.data:
                return result.data[0]["id"]

        return None

    def insert_entry(self, entry: EntryData, horse_id: str) -> Optional[str]:
        """Insert a race entry."""
        insert_data = {
            "horse_id": horse_id,
            "race_date": entry.race_date.isoformat(),
            "post_time": entry.post_time,
            "timezone": entry.timezone,
            "track": entry.track,
            "track_code": entry.track_code,
            "race_number": entry.race_number,
            "race_type": entry.race_type,
            "race_name": entry.race_name,
            "is_stakes": entry.is_stakes,
            "stakes_grade": entry.stakes_grade,
            "purse": entry.purse,
            "distance": entry.distance,
            "surface": entry.surface,
            "conditions": entry.conditions,
            "post_position": entry.post_position,
            "morning_line": entry.morning_line,
            "jockey": entry.jockey,
            "trainer": entry.trainer,
            "owner": entry.owner,
            "weight": entry.weight,
            "claim_price": entry.claim_price,
            "medication": entry.medication,
            "entries_url": entry.entries_url,
            "equibase_email_id": entry.equibase_email_id,
            "raw_email_subject": entry.raw_email_subject,
        }

        try:
            result = self.client.table("entries") \
                .upsert(insert_data, on_conflict="horse_id,race_date,track,race_number") \
                .execute()

            if result.data:
                return result.data[0]["id"]
        except Exception as e:
            print(f"Error inserting entry: {e}")

        return None

    def mark_entry_scratched(self, horse_id: str, race_date: date, track: str, race_number: int):
        """Mark an entry as scratched."""
        self.client.table("entries") \
            .update({
                "scratched": True,
                "scratched_at": "now()"
            }) \
            .eq("horse_id", horse_id) \
            .eq("race_date", race_date.isoformat()) \
            .eq("track", track) \
            .eq("race_number", race_number) \
            .execute()

    def insert_result(self, result_data: ResultData, horse_id: str) -> Optional[str]:
        """Insert a race result."""
        # Try to link to existing entry
        entry_id = self._find_entry(horse_id, result_data.race_date, result_data.track, result_data.race_number)

        insert_data = {
            "horse_id": horse_id,
            "entry_id": entry_id,
            "race_date": result_data.race_date.isoformat(),
            "track": result_data.track,
            "track_code": result_data.track_code,
            "race_number": result_data.race_number,
            "race_type": result_data.race_type,
            "race_name": result_data.race_name,
            "is_stakes": result_data.is_stakes,
            "stakes_grade": result_data.stakes_grade,
            "purse": result_data.purse,
            "distance": result_data.distance,
            "surface": result_data.surface,
            "finish_position": result_data.finish_position,
            "beaten_lengths": result_data.beaten_lengths,
            "win_margin": result_data.win_margin,
            "odds": result_data.odds,
            "jockey": result_data.jockey,
            "trainer": result_data.trainer,
            "owner": result_data.owner,
            "post_position": result_data.post_position,
            "chart_url": result_data.chart_url,
            "replay_url": result_data.replay_url,
            "equibase_email_id": result_data.equibase_email_id,
            "raw_email_subject": result_data.raw_email_subject,
        }

        try:
            result = self.client.table("results") \
                .upsert(insert_data, on_conflict="horse_id,race_date,track,race_number") \
                .execute()

            if result.data:
                return result.data[0]["id"]
        except Exception as e:
            print(f"Error inserting result: {e}")

        return None

    def _find_entry(self, horse_id: str, race_date: date, track: str, race_number: int) -> Optional[str]:
        """Find existing entry to link with result."""
        result = self.client.table("entries") \
            .select("id") \
            .eq("horse_id", horse_id) \
            .eq("race_date", race_date.isoformat()) \
            .eq("track", track) \
            .eq("race_number", race_number) \
            .execute()

        if result.data:
            return result.data[0]["id"]
        return None

    def insert_workout(self, workout: WorkoutData, horse_id: str) -> Optional[str]:
        """Insert a workout record."""
        insert_data = {
            "horse_id": horse_id,
            "workout_date": workout.workout_date.isoformat(),
            "track": workout.track,
            "distance": workout.distance,
            "time": workout.time,
            "time_note": workout.time_note,
            "track_condition": workout.track_condition,
            "surface": workout.surface,
            "rank_position": workout.rank_position,
            "rank_total": workout.rank_total,
            "equibase_email_id": workout.equibase_email_id,
        }

        try:
            result = self.client.table("workouts") \
                .upsert(insert_data, on_conflict="horse_id,workout_date,track,distance") \
                .execute()

            if result.data:
                return result.data[0]["id"]
        except Exception as e:
            print(f"Error inserting workout: {e}")

        return None

    def is_email_processed(self, email_id: str) -> bool:
        """Check if an email has already been processed."""
        result = self.client.table("email_log") \
            .select("id") \
            .eq("email_id", email_id) \
            .execute()

        return len(result.data) > 0

    def log_email(self, email_id: str, subject: str, email_date, email_type: str,
                  success: bool = True, error_message: str = None):
        """Log email processing."""
        self.client.table("email_log") \
            .insert({
                "email_id": email_id,
                "email_subject": subject,
                "email_date": email_date.isoformat() if email_date else None,
                "email_type": email_type,
                "success": success,
                "error_message": error_message,
            }) \
            .execute()
