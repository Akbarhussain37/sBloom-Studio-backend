BEGIN;

ALTER POLICY "Users can create their own projects"
ON public.projects_studio
TO authenticated;

ALTER POLICY "Users can view their own projects"
ON public.projects_studio
TO authenticated;

ALTER POLICY "Users can update their own projects"
ON public.projects_studio
TO authenticated;

ALTER POLICY "Users can delete their own projects"
ON public.projects_studio
TO authenticated;

ALTER POLICY "Users can view their own media assets"
ON public.media_assets_studio
TO authenticated;

ALTER POLICY "Users can delete their own media assets"
ON public.media_assets_studio
TO authenticated;

ALTER POLICY "Users can view their own production jobs"
ON public.production_jobs_studio
TO authenticated;

COMMIT;
