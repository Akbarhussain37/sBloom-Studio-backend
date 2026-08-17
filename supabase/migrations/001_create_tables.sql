-- ============================================
-- CLEANUP EXISTING TABLES (for development)
-- ============================================
DROP TABLE IF EXISTS public.profile_images_studio CASCADE;
DROP TABLE IF EXISTS public.profile_studio CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.bookings_studio CASCADE;
DROP TABLE IF EXISTS public.contact_submissions_studio CASCADE;

-- ============================================
-- PROFILE STUDIO TABLE (extends Supabase auth.users)
-- ============================================
CREATE TABLE public.profile_studio (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('creator', 'kid')),
  -- Creator-specific fields
  phone_number TEXT,
  location TEXT,
  age INTEGER,
  gender TEXT,
  portfolio_url TEXT,
  bio TEXT,
  primary_content_category TEXT,
  primary_software TEXT,
  -- Kid-specific fields
  parent_phone TEXT,
  parent_email TEXT,
  kid_age INTEGER CHECK (kid_age BETWEEN 5 AND 16),
  kid_gender TEXT,
  interest TEXT,
  parent_goal TEXT,
  -- Metadata
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profile_studio ENABLE ROW LEVEL SECURITY;

-- Users can read/update their own profile
CREATE POLICY "Users can view own profile"
  ON public.profile_studio FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profile_studio FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profile_studio FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================
-- bookings_studio TABLE (from Marketing/KidsZone forms)
-- ============================================
CREATE TABLE public.bookings_studio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  project_type TEXT NOT NULL,
  source TEXT DEFAULT 'website',   -- 'creators_page' | 'kids_zone' | 'website'
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- nullable for guest bookings_studio
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.bookings_studio ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (guest or logged-in)
CREATE POLICY "Anyone can create bookings_studio"
  ON public.bookings_studio FOR INSERT
  WITH CHECK (TRUE);

-- Users can view their own bookings_studio
CREATE POLICY "Users can view own bookings_studio"
  ON public.bookings_studio FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================
-- contact_submissions_studio TABLE (future contact form)
-- ============================================
CREATE TABLE public.contact_submissions_studio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.contact_submissions_studio ENABLE ROW LEVEL SECURITY;

-- Anyone can submit
CREATE POLICY "Anyone can submit contact form"
  ON public.contact_submissions_studio FOR INSERT
  WITH CHECK (TRUE);

-- ============================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profile_studio_updated_at
  BEFORE UPDATE ON public.profile_studio
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- PROFILE IMAGES TABLE
-- ============================================
CREATE TABLE public.profile_images_studio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profile_studio(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profile_images_studio ENABLE ROW LEVEL SECURITY;

-- Anyone can view images
CREATE POLICY "Anyone can view profile images"
  ON public.profile_images_studio FOR SELECT
  USING (TRUE);

-- Users can upload/insert their own images
CREATE POLICY "Users can insert own profile images"
  ON public.profile_images_studio FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own images
CREATE POLICY "Users can delete own profile images"
  ON public.profile_images_studio FOR DELETE
  USING (auth.uid() = user_id);

/*
  NOTE: For profile_images_studio to work, you must create a public storage bucket 
  named "profile_images_studio" in the Supabase Dashboard -> Storage.
  Ensure you set up Storage RLS policies so authenticated users can upload 
  and anyone can view.
*/
