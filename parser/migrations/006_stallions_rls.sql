-- Enable RLS on stallions table and add policies for authenticated users
ALTER TABLE stallions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all stallions
CREATE POLICY "Allow authenticated read" ON stallions
    FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to insert stallions
CREATE POLICY "Allow authenticated insert" ON stallions
    FOR INSERT TO authenticated WITH CHECK (true);

-- Allow authenticated users to update stallions
CREATE POLICY "Allow authenticated update" ON stallions
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Allow authenticated users to delete stallions
CREATE POLICY "Allow authenticated delete" ON stallions
    FOR DELETE TO authenticated USING (true);

-- Same for organization_stallions junction table
ALTER TABLE organization_stallions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON organization_stallions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert" ON organization_stallions
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated delete" ON organization_stallions
    FOR DELETE TO authenticated USING (true);
