-- ============================================
-- SBLOOM SECURITY REMEDIATION MIGRATION
-- STEP 3B (CORRECTED)
-- WARNING: FORWARD-ONLY MIGRATION
-- ============================================

BEGIN;

-- 0. ENABLE ROW LEVEL SECURITY FOR PROFILE_STUDIO
-- Critical missing live state fixed here
ALTER TABLE public.profile_studio ENABLE ROW LEVEL SECURITY;

-- 1. TABLE PRIVILEGE NORMALIZATION & PROFILE COLUMN PRIVILEGES
-- profile_studio
REVOKE ALL ON TABLE public.profile_studio FROM anon;
REVOKE ALL ON TABLE public.profile_studio FROM authenticated;
-- (Service role retains its existing privileges)

GRANT SELECT ON TABLE public.profile_studio TO authenticated;

-- Grant INSERT strictly on approved columns. 
GRANT INSERT (
    id, role, email, onboarding_completed, full_name, phone_number, location, age, gender, 
    portfolio_url, bio, primary_content_category, 
    primary_software, parent_phone, parent_email, 
    kid_age, kid_gender, interest, parent_goal
) ON TABLE public.profile_studio TO authenticated;

-- Grant UPDATE strictly on approved editable columns.
GRANT UPDATE (
    full_name, phone_number, location, age, gender, 
    portfolio_url, bio, primary_content_category, 
    primary_software, parent_phone, parent_email, 
    kid_age, kid_gender, interest, parent_goal
) ON TABLE public.profile_studio TO authenticated;


-- projects_studio
REVOKE ALL ON TABLE public.projects_studio FROM anon;
REVOKE ALL ON TABLE public.projects_studio FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects_studio TO authenticated;


-- media_assets_studio
REVOKE ALL ON TABLE public.media_assets_studio FROM anon;
REVOKE ALL ON TABLE public.media_assets_studio FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.media_assets_studio TO authenticated;


-- production_jobs_studio
REVOKE ALL ON TABLE public.production_jobs_studio FROM anon;
REVOKE ALL ON TABLE public.production_jobs_studio FROM authenticated;

-- ONLY SELECT and INSERT permitted
GRANT SELECT, INSERT ON TABLE public.production_jobs_studio TO authenticated;


-- 2. PROFILE_STUDIO POLICIES
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profile_studio;
CREATE POLICY "Users can insert own profile"
    ON public.profile_studio 
    FOR INSERT 
    TO authenticated
    WITH CHECK (
        auth.uid() = id
        AND email = (auth.jwt() ->> 'email')
        AND role IN ('creator', 'kid')
    );

-- Explicitly scope existing profile policies to 'authenticated' to ensure tight control
DROP POLICY IF EXISTS "Users can view own profile" ON public.profile_studio;
CREATE POLICY "Users can view own profile"
    ON public.profile_studio 
    FOR SELECT 
    TO authenticated
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profile_studio;
CREATE POLICY "Users can update own profile"
    ON public.profile_studio 
    FOR UPDATE 
    TO authenticated
    USING (auth.uid() = id);


-- 3. MEDIA_ASSETS_STUDIO OWNERSHIP RLS FIX
DROP POLICY IF EXISTS "Users can create their own media assets" ON public.media_assets_studio;
DROP POLICY IF EXISTS "Users can update their own media assets" ON public.media_assets_studio;

CREATE POLICY "Users can create their own media assets"
    ON public.media_assets_studio 
    FOR INSERT 
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id 
        AND (
            project_id IS NULL 
            OR EXISTS (
                SELECT 1 FROM public.projects_studio 
                WHERE projects_studio.id = media_assets_studio.project_id 
                AND projects_studio.user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can update their own media assets"
    ON public.media_assets_studio 
    FOR UPDATE 
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id 
        AND (
            project_id IS NULL 
            OR EXISTS (
                SELECT 1 FROM public.projects_studio 
                WHERE projects_studio.id = media_assets_studio.project_id 
                AND projects_studio.user_id = auth.uid()
            )
        )
    );


-- 4. PRODUCTION_JOBS_STUDIO OWNERSHIP RLS FIX
DROP POLICY IF EXISTS "Users can create their own production jobs" ON public.production_jobs_studio;
CREATE POLICY "Users can create their own production jobs"
    ON public.production_jobs_studio 
    FOR INSERT 
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id 
        AND EXISTS (
            SELECT 1 FROM public.media_assets_studio 
            WHERE media_assets_studio.id = production_jobs_studio.media_asset_id 
            AND media_assets_studio.user_id = auth.uid()
        )
    );

COMMIT;
