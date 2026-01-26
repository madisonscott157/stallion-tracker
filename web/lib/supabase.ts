import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types for database tables
export interface Stallion {
  id: string
  name: string
  yob: number | null
  sire: string | null
  dam: string | null
  stud_farm: string | null
}

export interface Horse {
  id: string
  name: string | null
  sex: string | null
  yob: number | null
  sire_id: string
  dam: string | null
  is_unnamed: boolean
  equibase_profile_url: string | null
}

export interface Entry {
  id: string
  horse_id: string
  race_date: string
  post_time: string | null
  timezone: string
  track: string
  track_code: string | null
  race_number: number
  race_type: string | null
  race_name: string | null
  is_stakes: boolean
  stakes_grade: string | null
  purse: number | null
  distance: string | null
  surface: string | null
  post_position: number | null
  morning_line: string | null
  jockey: string | null
  trainer: string | null
  scratched: boolean
  entries_url: string | null
  // Joined fields
  horse_name?: string | null
  horse_sex?: string | null
  horse_yob?: number | null
  horse_dam?: string | null
  horse_is_unnamed?: boolean
  horse_profile_url?: string | null
  sire_name?: string
}

export interface Result {
  id: string
  horse_id: string
  race_date: string
  track: string
  track_code: string | null
  race_number: number
  race_type: string | null
  race_name: string | null
  is_stakes: boolean
  stakes_grade: string | null
  purse: number | null
  distance: string | null
  surface: string | null
  finish_position: number
  beaten_lengths: string | null
  win_margin: string | null
  odds: string | null
  jockey: string | null
  trainer: string | null
  chart_url: string | null
  // Joined fields
  horse_name?: string | null
  horse_sex?: string | null
  horse_yob?: number | null
  horse_dam?: string | null
  sire_name?: string
}

export interface Workout {
  id: string
  horse_id: string
  workout_date: string
  track: string
  distance: string | null
  time: string | null
  time_note: string | null
  track_condition: string | null
  surface: string | null
  rank_position: number | null
  rank_total: number | null
  // Joined fields
  horse_name?: string | null
  horse_sex?: string | null
  horse_yob?: number | null
  horse_dam?: string | null
  horse_is_unnamed?: boolean
  horse_profile_url?: string | null
  sire_name?: string
}

export interface StallionStats {
  stallion_id: string
  stallion_name: string
  year: number
  starters: number
  winners: number
  win_pct: number
  stakes_winners: number
  total_earnings: number
}
