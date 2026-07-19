-- Phase 2: RLS Policies for Write Access
-- Run this in your Supabase SQL Editor

-- Allow authenticated users to UPDATE workflow_departments (for Settings tab)
CREATE POLICY "Authenticated users can update departments"
  ON public.workflow_departments FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to UPSERT department settings
CREATE POLICY "Authenticated users can upsert department settings"
  ON public.workflow_department_settings FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update department settings"
  ON public.workflow_department_settings FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to read workflow_events
CREATE POLICY "Enable read access for all users on events"
  ON public.workflow_events FOR SELECT
  USING (true);

-- Allow authenticated users to INSERT into workflow_stage_history and workflow_events (for transitions)
CREATE POLICY "Authenticated users can insert stage history"
  ON public.workflow_stage_history FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update stage history"
  ON public.workflow_stage_history FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert workflow events"
  ON public.workflow_events FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
