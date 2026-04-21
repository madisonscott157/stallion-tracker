ALTER TABLE organizations
ADD COLUMN show_race_activity BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN organizations.show_race_activity IS
'When false, UI and APIs omit entries/results/workouts/recent-winners/recent-stakes for this org. Used for orgs whose stallions lack complete race data.';
