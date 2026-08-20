-- Migration: Create production_submissions_studio
-- Purpose: Represents a Creator's submitted production request whose raw/source content remains in the customer's own cloud storage.

BEGIN;

-- 1. Create a safe, namespaced trigger function for updated_at
CREATE FUNCTION public.sbloom_set_production_submission_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create the production_submissions_studio table
CREATE TABLE public.production_submissions_studio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects_studio(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    source_type TEXT NOT NULL,
    source_provider TEXT NOT NULL,
    source_url TEXT NOT NULL,
    source_name TEXT NULL,
    instructions TEXT NOT NULL,

    access_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',

    source_access_attested_at TIMESTAMPTZ NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT chk_source_type CHECK (source_type IN ('FILE', 'FOLDER')),
    CONSTRAINT chk_source_provider CHECK (source_provider IN ('GOOGLE_DRIVE', 'ONEDRIVE', 'SHAREPOINT', 'DROPBOX', 'OTHER')),
    CONSTRAINT chk_access_status CHECK (access_status IN ('PENDING_VERIFICATION', 'ACCESS_CONFIRMED', 'ACCESS_REQUIRED')),
    CONSTRAINT chk_source_url_format CHECK (
        source_url = btrim(source_url) AND
        source_url <> '' AND
        length(source_url) <= 2048 AND
        source_url ~* '^https://'
    ),
    CONSTRAINT chk_instructions_not_empty CHECK (
        instructions = btrim(instructions) AND
        instructions <> '' AND
        length(instructions) <= 5000
    ),
    CONSTRAINT chk_source_name_length CHECK (
        source_name IS NULL OR (
            source_name = btrim(source_name) AND
            length(source_name) >= 1 AND
            length(source_name) <= 255
        )
    )
);

-- 3. Add ownership rule: Ensure the submission's user_id matches the project's user_id
CREATE FUNCTION public.sbloom_validate_submission_project_owner()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.projects_studio p
        WHERE p.id = NEW.project_id
          AND p.user_id = NEW.user_id
    )
    THEN
        RAISE EXCEPTION 'Submission user_id must match project owner user_id';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_sbloom_project_ownership
    BEFORE INSERT OR UPDATE ON public.production_submissions_studio
    FOR EACH ROW
    EXECUTE FUNCTION public.sbloom_validate_submission_project_owner();

-- 4. Apply updated_at trigger
CREATE TRIGGER handle_sbloom_production_submission_updated_at
    BEFORE UPDATE ON public.production_submissions_studio
    FOR EACH ROW
    EXECUTE FUNCTION public.sbloom_set_production_submission_updated_at();

-- 5. Revoke function privileges
REVOKE ALL ON FUNCTION public.sbloom_validate_submission_project_owner() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sbloom_set_production_submission_updated_at() FROM PUBLIC;

-- 6. Indexes
CREATE INDEX idx_production_submissions_project_id ON public.production_submissions_studio(project_id);
CREATE INDEX idx_production_submissions_user_id_created_at ON public.production_submissions_studio(user_id, created_at DESC);
CREATE INDEX idx_production_submissions_access_status ON public.production_submissions_studio(access_status);

-- 7. Row Level Security (RLS)
ALTER TABLE public.production_submissions_studio ENABLE ROW LEVEL SECURITY;

-- 8. Revoke default access and grant appropriate privileges
REVOKE ALL ON public.production_submissions_studio FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.production_submissions_studio TO authenticated;
-- Ensure service_role has only SELECT and INSERT privileges for Phase E2 backend usage
GRANT SELECT, INSERT ON public.production_submissions_studio TO service_role;

-- 9. RLS Policies
CREATE POLICY "Creators can view their own submissions"
    ON public.production_submissions_studio
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

COMMIT;
