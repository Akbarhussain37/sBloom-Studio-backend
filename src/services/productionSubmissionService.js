const supabaseLib = require('../lib/supabase');

async function createSubmission(userId, accessToken, data) {
  // 1. Ownership check using user-scoped client
  const userClient = supabaseLib.createUserScopedClient(accessToken);

  const { data: project, error: projectError } = await userClient
    .from('projects_studio')
    .select('id')
    .eq('id', data.project_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (projectError) {
    throw projectError; // Propagates as 500 INTERNAL_ERROR via central handler
  }

  if (!project) {
    const error = new Error('Project not found');
    error.status = 404;
    error.code = 'PROJECT_NOT_FOUND';
    throw error;
  }

  // 2. Insert using service-role client
  const serviceClient = supabaseLib.createServiceClient();

  const insertPayload = {
    project_id: data.project_id,
    user_id: userId, // Server-derived
    source_type: data.source_type,
    source_provider: data.source_provider,
    source_url: data.source_url,
    source_name: data.source_name,
    instructions: data.instructions,
    source_access_attested_at: new Date().toISOString() // Server-derived
  };

  const { data: inserted, error: insertError } = await serviceClient
    .from('production_submissions_studio')
    .insert(insertPayload)
    .select('id, project_id, source_type, source_provider, source_name, access_status, submitted_at')
    .single();

  if (insertError) {
    throw insertError; // Propagates as 500 INTERNAL_ERROR
  }

  return inserted;
}

module.exports = {
  createSubmission
};
