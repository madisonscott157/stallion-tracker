import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Browser client for client components
export function createClientComponentClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

// Legacy export for backward compatibility
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

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
  owner: string | null
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
  replay_url: string | null
  owner: string | null
  // Joined fields
  horse_name?: string | null
  horse_sex?: string | null
  horse_yob?: number | null
  horse_dam?: string | null
  horse_profile_url?: string | null
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

export interface SalesStats {
  id: string
  stallion_id: string
  sale_year: number
  sale_type: string  // 'yearlings' | 'weanlings' | '2yo_training' | 'covering_sires'
  through_ring: number | null
  number_sold: number | null
  gross_sales: number | null
  average_price: number | null
  median_price: number | null
  average_rank: number | null
  median_rank: number | null
  top_colt_price: number | null
  top_filly_price: number | null
  source_url: string | null
  scraped_at: string
  // Joined fields
  stallion_name?: string
}

export interface SireRanking {
  id: string
  stallion_id: string
  year: number
  list_type: string  // 'ytd' | 'freshman' | 'second_crop' | 'third_crop'
  rank: number | null
  starters: number | null
  winners: number | null
  wins: number | null
  win_pct: number | null
  black_type_winners: number | null
  black_type_horses: number | null
  graded_stakes_winners: number | null
  graded_stakes_horses: number | null
  g1_winners: number | null
  g1_horses: number | null
  total_earnings: number | null
  earnings_per_starter: number | null
  highest_earner_name: string | null
  highest_earner_amount: number | null
  stud_fee: number | null
  standing_at: string | null
  source_url: string | null
  scraped_at: string
}

export interface EquinelineStats {
  id: string
  stallion_id: string

  // Summary stats
  crops: number | null
  foals: number | null
  crops_racing_age: number | null
  foals_racing_age: number | null
  current_2yo_foals: number | null
  yearlings: number | null
  weanlings: number | null

  // Achievement counts
  champions: number | null
  graded_stakes_winners: number | null
  blacktype_winners: number | null
  blacktype_placers: number | null

  // Lifetime stats
  lifetime_starters: number | null
  lifetime_starters_pct: number | null
  lifetime_winners: number | null
  lifetime_winners_pct: number | null
  lifetime_btw: number | null
  lifetime_btw_pct: number | null
  lifetime_btp: number | null
  lifetime_btp_pct: number | null
  lifetime_starts: number | null
  lifetime_wins: number | null
  lifetime_wins_pct: number | null
  lifetime_placings: number | null
  lifetime_placings_pct: number | null
  lifetime_earnings: number | null
  lifetime_avg_earnings: number | null

  // Current year stats
  current_year: number | null
  current_starters: number | null
  current_starters_pct: number | null
  current_winners: number | null
  current_winners_pct: number | null
  current_btw: number | null
  current_btw_pct: number | null
  current_btp: number | null
  current_btp_pct: number | null
  current_starts: number | null
  current_wins: number | null
  current_wins_pct: number | null
  current_placings: number | null
  current_placings_pct: number | null
  current_earnings: number | null
  current_avg_earnings: number | null

  // Current 2yo stats
  current_2yo_starters: number | null
  current_2yo_starters_pct: number | null
  current_2yo_winners: number | null
  current_2yo_winners_pct: number | null
  current_2yo_btw: number | null
  current_2yo_btw_pct: number | null
  current_2yo_btp: number | null
  current_2yo_btp_pct: number | null
  current_2yo_starts: number | null
  current_2yo_wins: number | null
  current_2yo_wins_pct: number | null
  current_2yo_placings: number | null
  current_2yo_placings_pct: number | null
  current_2yo_earnings: number | null
  current_2yo_avg_earnings: number | null

  // Top earners
  chief_earner_name: string | null
  chief_earner_amount: number | null
  current_top_earner_name: string | null
  current_top_earner_amount: number | null

  source_url: string | null
  scraped_at: string
}
