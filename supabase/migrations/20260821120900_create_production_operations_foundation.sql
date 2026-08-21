-- Migration: Create production operations foundation
-- Purpose: Minimal secure foundation for the external-source production workflow.

BEGIN;

-- 1. ADD production_staff ROLE
-- Extract exact constraint name from 20260817160000_add_roles_and_quota.sql
ALTER TABLE public.profile_studio DROP CONSTRAINT IF EXISTS profile_studio_role_check;
ALTER TABLE public.profile_studio ADD CONSTRAINT profile_studio_role_check
    CHECK (role IN ('creator', 'kid', 'doctor', 'admin', 'production_staff'));


-- 2. CREATE production_work_items_studio
CREATE TABLE public.production_work_items_studio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.production_submissions_studio(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'QUEUED',
    assigned_to UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    accepted_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    accepted_at TIMESTAMPTZ NULL,
    started_at TIMESTAMPTZ NULL,
    ready_for_review_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_production_work_items_submission UNIQUE (submission_id),
    CONSTRAINT chk_work_item_status CHECK (status IN ('QUEUED', 'IN_PRODUCTION', 'READY_FOR_REVIEW', 'CHANGES_REQUESTED', 'COMPLETED'))
);

-- Narrowly named updated_at trigger for work items
CREATE FUNCTION public.sbloom_set_production_work_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handle_sbloom_production_work_items_updated_at
    BEFORE UPDATE ON public.production_work_items_studio
    FOR EACH ROW
    EXECUTE FUNCTION public.sbloom_set_production_work_items_updated_at();

REVOKE ALL ON FUNCTION public.sbloom_set_production_work_items_updated_at() FROM PUBLIC, anon, authenticated;

-- Work Items Indexes
CREATE INDEX idx_production_work_items_status ON public.production_work_items_studio(status);
CREATE INDEX idx_production_work_items_assigned_to ON public.production_work_items_studio(assigned_to);

-- Work Items RLS & Grants
ALTER TABLE public.production_work_items_studio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.production_work_items_studio FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.production_work_items_studio TO service_role;


-- 3. CREATE production_events_studio
CREATE TABLE public.production_events_studio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.production_submissions_studio(id) ON DELETE RESTRICT,
    work_item_id UUID NULL REFERENCES public.production_work_items_studio(id) ON DELETE RESTRICT,
    actor_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_role TEXT NOT NULL,
    event_type TEXT NOT NULL,
    from_status TEXT NULL,
    to_status TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Event Privacy: prevent source_url and instructions from being stored at top-level
    CONSTRAINT chk_event_privacy CHECK (
        NOT (metadata ? 'source_url') AND
        NOT (metadata ? 'instructions')
    )
);

-- Events Indexes
CREATE INDEX idx_production_events_submission_id_created_at ON public.production_events_studio(submission_id, created_at DESC);
CREATE INDEX idx_production_events_work_item_id_created_at ON public.production_events_studio(work_item_id, created_at DESC);

-- Events RLS & Grants
ALTER TABLE public.production_events_studio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.production_events_studio FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.production_events_studio TO service_role;

COMMIT;
