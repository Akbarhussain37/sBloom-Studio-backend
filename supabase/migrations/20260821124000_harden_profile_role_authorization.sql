BEGIN;

-- 1. DROP LEGACY PUBLIC POLICIES
DROP POLICY IF EXISTS "Enable insert access for users" ON public.profile_studio;
DROP POLICY IF EXISTS "Enable read access for users" ON public.profile_studio;
DROP POLICY IF EXISTS "Enable update access for users" ON public.profile_studio;

-- 2. NORMALIZE PRIVILEGES
REVOKE ALL ON TABLE public.profile_studio
FROM PUBLIC, anon, authenticated;

-- 3. GRANT REQUIRED PRIVILEGES
GRANT SELECT ON TABLE public.profile_studio TO authenticated;

GRANT INSERT (
    id, role, email, onboarding_completed, full_name, phone_number, location, age, gender,
    portfolio_url, bio, primary_content_category, primary_software, parent_phone, parent_email,
    kid_age, kid_gender, interest, parent_goal
) ON TABLE public.profile_studio TO authenticated;

GRANT UPDATE (
    full_name, phone_number, location, age, gender,
    portfolio_url, bio, primary_content_category, primary_software, parent_phone, parent_email,
    kid_age, kid_gender, interest, parent_goal
) ON TABLE public.profile_studio TO authenticated;

-- 4. RECREATE SECURE RLS POLICIES
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
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

COMMIT;
