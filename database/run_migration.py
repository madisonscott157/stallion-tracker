#!/usr/bin/env python3
"""Run database migration using Supabase service role."""

import os
from pathlib import Path
from supabase import create_client

# Load environment
from dotenv import load_dotenv
load_dotenv()

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    exit(1)

# Read migration file
migration_file = Path(__file__).parent / 'migrations' / '001_auth_and_rls.sql'
migration_sql = migration_file.read_text()

# Split into individual statements (simple split on semicolons outside of functions)
# Note: This is a simplified approach - complex SQL might need better parsing

print("Running migration: 001_auth_and_rls.sql")
print("=" * 50)

# Create admin client
client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# For Supabase, we need to use the postgres connection directly
# The REST API doesn't support DDL statements
# Let's try using rpc to call pg functions

# Actually, we need to use the SQL editor or a direct postgres connection
# Let me output the SQL so you can run it manually

print("\nThis migration needs to be run in the Supabase SQL Editor.")
print("Go to: https://supabase.com/dashboard/project/slvdbovcuneynonunfyz/sql/new")
print("\nCopy and paste the contents of:")
print(f"  {migration_file}")
print("\nOr run individual statements below:\n")
print("-" * 50)

# Print key statements
statements = [
    "-- 1. Add columns to users table",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE;",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin'));",
    "CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);",
]

for stmt in statements:
    print(stmt)

print("\n... (see full migration file for RLS policies)")
