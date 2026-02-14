"""Supabase database client and operations."""

import os
import time
from typing import Optional
from datetime import date
import httpx
from supabase import create_client, Client
from dotenv import load_dotenv

from models import HorseData, EntryData, ResultData, WorkoutData

load_dotenv()


def retry_on_error(func, max_retries=5, delay=3):
    """Retry a function on transient errors (HTTP/2 resets, timeouts, etc.)."""
    def wrapper(*args, **kwargs):
        last_error = None
        for attempt in range(max_retries):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                last_error = e
                if attempt < max_retries - 1:
                    wait_time = delay * (attempt + 1)
                    print(f"  Retry {attempt + 1}/{max_retries} after error: {e}")
                    print(f"  Waiting {wait_time}s before retry...")
                    time.sleep(wait_time)
        raise last_error
    return wrapper


class Database:
    """Supabase database wrapper."""

    def __init__(self):
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_KEY")

        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")

        self.client: Client = create_client(url, key)

        # Patch the postgrest client to use HTTP/1.1
        # This prevents "StreamReset" errors from HTTP/2 connection issues in CI
        try:
            if hasattr(self.client, 'postgrest'):
                postgrest = self.client.postgrest
                if hasattr(postgrest, 'session'):
                    old_session = postgrest.session
                    postgrest.session = httpx.Client(
                        base_url=old_session.base_url,
                        headers=dict(old_session.headers),
                        timeout=httpx.Timeout(60.0),
                        http2=False,  # Force HTTP/1.1
                    )
                elif hasattr(postgrest, '_session'):
                    old_session = postgrest._session
                    postgrest._session = httpx.Client(
                        base_url=old_session.base_url,
                        headers=dict(old_session.headers),
                        timeout=httpx.Timeout(60.0),
                        http2=False,  # Force HTTP/1.1
                    )
        except Exception as e:
            print(f"Warning: Could not patch HTTP/1.1: {e}")

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
        @retry_on_error
        def _fetch():
            return self.client.table("stallions") \
                .select("name_normalized") \
                .execute()

        result = _fetch()
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
        """Find existing horse by equibase_refno, name+sire, or sire+dam for unnamed."""
        # First try by equibase_refno - this is authoritative
        # A horse can only exist once regardless of sire in comments
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

        # Try by sire + dam + yob (for unnamed horses or matching siblings)
        # Include YOB to avoid matching the wrong sibling
        if horse.dam:
            query = self.client.table("horses") \
                .select("id") \
                .eq("sire_id", sire_id) \
                .eq("dam_normalized", horse.dam.lower().strip())

            # If we have YOB, include it to avoid matching siblings from different years
            if horse.yob:
                query = query.eq("yob", horse.yob)

            result = query.execute()
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

        # Copy jockey/trainer from linked entry if not already set on the result
        jockey = result_data.jockey
        trainer = result_data.trainer
        if entry_id and (not jockey or not trainer):
            entry = self.client.table("entries") \
                .select("jockey, trainer") \
                .eq("id", entry_id) \
                .single() \
                .execute()
            if entry.data:
                if not jockey:
                    jockey = entry.data.get("jockey")
                if not trainer:
                    trainer = entry.data.get("trainer")

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
            "jockey": jockey,
            "trainer": trainer,
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

    def upsert_sales_stats(self, stallion_id: str, data) -> Optional[str]:
        """
        Insert or update sales statistics for a stallion.

        Args:
            stallion_id: UUID of the stallion
            data: SalesData object from tdn_sales_scraper

        Returns:
            ID of the inserted/updated record, or None on error
        """
        insert_data = {
            "stallion_id": stallion_id,
            "sale_year": data.sale_year,
            "sale_type": data.sale_type,
            "through_ring": data.through_ring,
            "number_sold": data.number_sold,
            "gross_sales": data.gross_sales,
            "average_price": data.average_price,
            "median_price": data.median_price,
            "average_rank": data.average_rank,
            "median_rank": data.median_rank,
            "top_colt_price": data.top_colt_price,
            "top_filly_price": data.top_filly_price,
            "source_url": data.source_url,
            "scraped_at": "now()",
            "updated_at": "now()",
        }

        try:
            result = self.client.table("sales_stats") \
                .upsert(insert_data, on_conflict="stallion_id,sale_year,sale_type") \
                .execute()

            if result.data:
                return result.data[0]["id"]
        except Exception as e:
            print(f"Error upserting sales stats: {e}")

        return None

    def get_sales_stats(self, stallion_id: str) -> list:
        """Get all sales stats for a stallion."""
        result = self.client.table("sales_stats") \
            .select("*") \
            .eq("stallion_id", stallion_id) \
            .order("sale_year", desc=True) \
            .order("sale_type") \
            .execute()

        return result.data or []

    def upsert_sire_ranking(self, stallion_id: str, data) -> Optional[str]:
        """
        Insert or update sire ranking data.

        Args:
            stallion_id: UUID of the stallion
            data: SireRankingData object from tdn_sire_list_scraper

        Returns:
            ID of the inserted/updated record, or None on error
        """
        insert_data = {
            "stallion_id": stallion_id,
            "year": data.year,
            "list_type": data.list_type,
            "rank": data.rank,
            "starters": data.starters,
            "winners": data.winners,
            "wins": data.wins,
            "win_pct": data.win_pct,
            "black_type_winners": data.black_type_winners,
            "black_type_horses": data.black_type_horses,
            "graded_stakes_winners": data.graded_stakes_winners,
            "graded_stakes_horses": data.graded_stakes_horses,
            "g1_winners": data.g1_winners,
            "g1_horses": data.g1_horses,
            "total_earnings": data.total_earnings,
            "earnings_per_starter": data.earnings_per_starter,
            "highest_earner_name": data.highest_earner_name,
            "highest_earner_amount": data.highest_earner_amount,
            "stud_fee": data.stud_fee,
            "standing_at": data.standing_at,
            "source_url": data.source_url,
            "scraped_at": "now()",
            "updated_at": "now()",
        }

        try:
            result = self.client.table("sire_rankings") \
                .upsert(insert_data, on_conflict="stallion_id,year,list_type") \
                .execute()

            if result.data:
                return result.data[0]["id"]
        except Exception as e:
            print(f"Error upserting sire ranking: {e}")

        return None

    def get_sire_rankings(self, stallion_id: str) -> list:
        """Get all sire rankings for a stallion."""
        result = self.client.table("sire_rankings") \
            .select("*") \
            .eq("stallion_id", stallion_id) \
            .order("year", desc=True) \
            .order("list_type") \
            .execute()

        return result.data or []

    def upsert_equineline_stats(self, stallion_id: str, data) -> Optional[str]:
        """
        Insert or update Equineline racing statistics.

        Args:
            stallion_id: UUID of the stallion
            data: EquinelineStats object from equineline_stats_scraper

        Returns:
            ID of the inserted/updated record, or None on error
        """
        insert_data = {
            "stallion_id": stallion_id,

            # Summary stats
            "crops": data.crops,
            "foals": data.foals,
            "crops_racing_age": data.crops_racing_age,
            "foals_racing_age": data.foals_racing_age,
            "current_2yo_foals": data.current_2yo_foals,
            "yearlings": data.yearlings,
            "weanlings": data.weanlings,

            # Achievement counts
            "champions": data.champions,
            "graded_stakes_winners": data.graded_stakes_winners,
            "blacktype_winners": data.blacktype_winners,
            "blacktype_placers": data.blacktype_placers,

            # Lifetime stats
            "lifetime_starters": data.lifetime_starters,
            "lifetime_starters_pct": data.lifetime_starters_pct,
            "lifetime_winners": data.lifetime_winners,
            "lifetime_winners_pct": data.lifetime_winners_pct,
            "lifetime_btw": data.lifetime_btw,
            "lifetime_btw_pct": data.lifetime_btw_pct,
            "lifetime_btp": data.lifetime_btp,
            "lifetime_btp_pct": data.lifetime_btp_pct,
            "lifetime_starts": data.lifetime_starts,
            "lifetime_wins": data.lifetime_wins,
            "lifetime_wins_pct": data.lifetime_wins_pct,
            "lifetime_placings": data.lifetime_placings,
            "lifetime_placings_pct": data.lifetime_placings_pct,
            "lifetime_earnings": data.lifetime_earnings,
            "lifetime_avg_earnings": data.lifetime_avg_earnings,

            # Current year stats
            "current_year": data.current_year,
            "current_starters": data.current_starters,
            "current_starters_pct": data.current_starters_pct,
            "current_winners": data.current_winners,
            "current_winners_pct": data.current_winners_pct,
            "current_btw": data.current_btw,
            "current_btw_pct": data.current_btw_pct,
            "current_btp": data.current_btp,
            "current_btp_pct": data.current_btp_pct,
            "current_starts": data.current_starts,
            "current_wins": data.current_wins,
            "current_wins_pct": data.current_wins_pct,
            "current_placings": data.current_placings,
            "current_placings_pct": data.current_placings_pct,
            "current_earnings": data.current_earnings,
            "current_avg_earnings": data.current_avg_earnings,

            # Current 2yo stats
            "current_2yo_starters": data.current_2yo_starters,
            "current_2yo_starters_pct": data.current_2yo_starters_pct,
            "current_2yo_winners": data.current_2yo_winners,
            "current_2yo_winners_pct": data.current_2yo_winners_pct,
            "current_2yo_btw": data.current_2yo_btw,
            "current_2yo_btw_pct": data.current_2yo_btw_pct,
            "current_2yo_btp": data.current_2yo_btp,
            "current_2yo_btp_pct": data.current_2yo_btp_pct,
            "current_2yo_starts": data.current_2yo_starts,
            "current_2yo_wins": data.current_2yo_wins,
            "current_2yo_wins_pct": data.current_2yo_wins_pct,
            "current_2yo_placings": data.current_2yo_placings,
            "current_2yo_placings_pct": data.current_2yo_placings_pct,
            "current_2yo_earnings": data.current_2yo_earnings,
            "current_2yo_avg_earnings": data.current_2yo_avg_earnings,

            # Top earners
            "chief_earner_name": data.chief_earner_name,
            "chief_earner_amount": data.chief_earner_amount,
            "current_top_earner_name": data.current_top_earner_name,
            "current_top_earner_amount": data.current_top_earner_amount,

            "source_url": data.source_url,
            "scraped_at": "now()",
            "updated_at": "now()",
        }

        try:
            result = self.client.table("equineline_stats") \
                .upsert(insert_data, on_conflict="stallion_id") \
                .execute()

            if result.data:
                return result.data[0]["id"]
        except Exception as e:
            print(f"Error upserting Equineline stats: {e}")

        return None

    def get_equineline_stats(self, stallion_id: str) -> Optional[dict]:
        """Get Equineline stats for a stallion."""
        result = self.client.table("equineline_stats") \
            .select("*") \
            .eq("stallion_id", stallion_id) \
            .single() \
            .execute()

        return result.data if result.data else None

    def backfill_result_jockey_trainer(self) -> int:
        """Backfill jockey/trainer on results from linked entries where missing."""
        # Get results that have an entry_id but are missing jockey or trainer
        results = self.client.table("results") \
            .select("id, entry_id, jockey, trainer") \
            .not_.is_("entry_id", "null") \
            .execute()

        updated = 0
        for row in results.data or []:
            if row["jockey"] and row["trainer"]:
                continue  # Both already set

            # Fetch from linked entry
            entry = self.client.table("entries") \
                .select("jockey, trainer") \
                .eq("id", row["entry_id"]) \
                .single() \
                .execute()

            if not entry.data:
                continue

            update_data = {}
            if not row["jockey"] and entry.data.get("jockey"):
                update_data["jockey"] = entry.data["jockey"]
            if not row["trainer"] and entry.data.get("trainer"):
                update_data["trainer"] = entry.data["trainer"]

            if update_data:
                self.client.table("results") \
                    .update(update_data) \
                    .eq("id", row["id"]) \
                    .execute()
                updated += 1
                print(f"  Updated result {row['id']}: {update_data}")

        return updated
