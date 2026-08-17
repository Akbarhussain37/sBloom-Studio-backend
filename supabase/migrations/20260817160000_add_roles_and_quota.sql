-- ============================================
-- ADD ROLES AND QUOTA FOR NEW DASHBOARDS
-- ============================================

-- 1. Update the check constraint for the 'role' column in 'profile_studio'
ALTER TABLE public.profile_studio DROP CONSTRAINT IF EXISTS profile_studio_role_check;
ALTER TABLE public.profile_studio ADD CONSTRAINT profile_studio_role_check CHECK (role IN ('creator', 'kid', 'doctor', 'admin'));

-- 2. Add 'free_edits_remaining' to 'profile_studio'
ALTER TABLE public.profile_studio ADD COLUMN IF NOT EXISTS free_edits_remaining INTEGER DEFAULT 2;

