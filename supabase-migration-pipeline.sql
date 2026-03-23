-- Create the calculation_pipelines table for the Visual Pipeline Builder feature
-- Run this in the Supabase Dashboard SQL Editor

CREATE TABLE IF NOT EXISTS public.calculation_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Default Pipeline',
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (matching other tables in this project)
ALTER TABLE public.calculation_pipelines ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anonymous users (matching existing RLS policy pattern)
CREATE POLICY "Allow all access to calculation_pipelines"
  ON public.calculation_pipelines
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Grant access to the anon role
GRANT ALL ON public.calculation_pipelines TO anon;
GRANT ALL ON public.calculation_pipelines TO authenticated;
