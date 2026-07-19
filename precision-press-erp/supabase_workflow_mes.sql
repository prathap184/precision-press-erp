-- 1. Create Workflow Departments Table
CREATE TABLE IF NOT EXISTS public.workflow_departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    color VARCHAR(50) DEFAULT '#3b82f6',
    icon VARCHAR(50) DEFAULT 'Layers',
    sla_minutes INTEGER DEFAULT 120,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Create Workflow Department Settings
CREATE TABLE IF NOT EXISTS public.workflow_department_settings (
    department_id UUID PRIMARY KEY REFERENCES public.workflow_departments(id) ON DELETE CASCADE,
    max_queue INTEGER DEFAULT 0,
    capacity VARCHAR(255),
    working_hours VARCHAR(255),
    auto_assign BOOLEAN DEFAULT false,
    allowed_roles JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Create Workflow Events (Log)
CREATE TABLE IF NOT EXISTS public.workflow_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(255) NOT NULL,
    department_id UUID REFERENCES public.workflow_departments(id) ON DELETE SET NULL,
    event_type VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    user_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 4. Create Workflow Stage History (Append-only Audit Ledger)
CREATE TABLE IF NOT EXISTS public.workflow_stage_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    department_id UUID REFERENCES public.workflow_departments(id) ON DELETE SET NULL,
    workflow_stage VARCHAR(100) NOT NULL,
    workflow_status VARCHAR(50) NOT NULL,
    parent_order_id VARCHAR(255) NOT NULL,
    child_order_id VARCHAR(255),
    entered_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    exited_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    duration_minutes INTEGER,
    active_time_minutes INTEGER,
    paused_time_minutes INTEGER,
    waiting_time_minutes INTEGER,
    assigned_to UUID,
    queue_position INTEGER DEFAULT 0,
    priority VARCHAR(50) DEFAULT 'NORMAL',
    sla_target_minutes INTEGER,
    sla_status VARCHAR(50),
    sla_breached_at TIMESTAMP WITH TIME ZONE,
    is_rework BOOLEAN DEFAULT false,
    is_rejected BOOLEAN DEFAULT false,
    entered_by UUID,
    exited_by UUID,
    remarks TEXT,
    snapshot JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_wsh_parent_order ON public.workflow_stage_history(parent_order_id);
CREATE INDEX IF NOT EXISTS idx_wsh_department ON public.workflow_stage_history(department_id);
CREATE INDEX IF NOT EXISTS idx_wsh_entered_at ON public.workflow_stage_history(entered_at);
CREATE INDEX IF NOT EXISTS idx_we_order ON public.workflow_events(order_id);
-- Seed Data
INSERT INTO public.workflow_departments (name, display_order, color, icon, sla_minutes, active) VALUES 
('Manager', 1, '#64748b', 'ShieldCheck', 120, true),
('Designer', 2, '#8b5cf6', 'Palette', 240, true),
('Printer', 3, '#3b82f6', 'Printer', 120, true),
('Pasting', 4, '#f59e0b', 'Layers', 180, true),
('Finishing', 5, '#10b981', 'CheckSquare', 120, true),
('Dispatch', 6, '#f97316', 'Truck', 120, true),
('Delivery', 7, '#ec4899', 'MapPin', 240, true),
('Accountant', 8, '#06b6d4', 'Calculator', 120, true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.workflow_department_settings (department_id, max_queue, capacity, working_hours, auto_assign, allowed_roles, metadata)
SELECT id, 40, '3 Operators', '9-6', false, '["Admin", "Printer", "Manager"]'::jsonb, '{"machineId": "HP-Latex-02"}'::jsonb
FROM public.workflow_departments WHERE name = 'Printer'
ON CONFLICT (department_id) DO NOTHING;