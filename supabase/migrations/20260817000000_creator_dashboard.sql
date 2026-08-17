-- Create custom types for ENUMS if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'production_status') THEN
        CREATE TYPE production_status AS ENUM (
            'DRAFT', 
            'UPLOADED', 
            'SUBMITTED', 
            'IN_REVIEW', 
            'EDITING', 
            'READY_FOR_REVIEW', 
            'CHANGES_REQUESTED', 
            'COMPLETED'
        );
    END IF;
END$$;

-- Create projects table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    status production_status DEFAULT 'DRAFT',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create media_assets table
CREATE TABLE IF NOT EXISTS public.media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    thumbnail_path TEXT,
    duration INTEGER,
    status production_status DEFAULT 'UPLOADED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create production_jobs table
CREATE TABLE IF NOT EXISTS public.production_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_asset_id UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status production_status DEFAULT 'SUBMITTED',
    notes TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Set up Row Level Security (RLS)

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_jobs ENABLE ROW LEVEL SECURITY;

-- Projects RLS
CREATE POLICY "Users can view their own projects"
    ON public.projects FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own projects"
    ON public.projects FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
    ON public.projects FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects"
    ON public.projects FOR DELETE
    USING (auth.uid() = user_id);

-- Media Assets RLS
CREATE POLICY "Users can view their own media assets"
    ON public.media_assets FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own media assets"
    ON public.media_assets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own media assets"
    ON public.media_assets FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own media assets"
    ON public.media_assets FOR DELETE
    USING (auth.uid() = user_id);

-- Production Jobs RLS
CREATE POLICY "Users can view their own production jobs"
    ON public.production_jobs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own production jobs"
    ON public.production_jobs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Insert a storage bucket for creator content if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'creator-content',
    'creator-content',
    false, -- Private bucket
    5368709120, -- 5GB max upload size
    '{image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime}'
)
ON CONFLICT (id) DO NOTHING;

-- Set up Storage RLS policies for the creator-content bucket
-- Allow users to upload to their own folder path (user_id/*)
CREATE POLICY "Users can upload their own media"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'creator-content' AND 
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to update their own media
CREATE POLICY "Users can update their own media"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'creator-content' AND 
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to read their own media
CREATE POLICY "Users can read their own media"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'creator-content' AND 
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own media
CREATE POLICY "Users can delete their own media"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'creator-content' AND 
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Functions and Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_projects_updated_at ON public.projects;
CREATE TRIGGER set_projects_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_media_assets_updated_at ON public.media_assets;
CREATE TRIGGER set_media_assets_updated_at
    BEFORE UPDATE ON public.media_assets
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_production_jobs_updated_at ON public.production_jobs;
CREATE TRIGGER set_production_jobs_updated_at
    BEFORE UPDATE ON public.production_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
