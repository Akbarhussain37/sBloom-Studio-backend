const supabaseLib = require('../lib/supabase');

async function listSubmissions(options = {}) {
  // Staff authorized operations use service-role
  const serviceClient = supabaseLib.createServiceClient();
  const limit = options.limit || 50;

  // Intentional safe projection for list view
  let query = serviceClient
    .from('production_submissions_studio')
    .select('id, project_id, user_id, source_type, source_provider, source_name, access_status, submitted_at')
    .order('submitted_at', { ascending: false })
    .limit(limit);

  if (options.access_status) {
    query = query.eq('access_status', options.access_status);
  }

  const { data, error } = await query;

  if (error) {
    throw error; // Propagates as 500 INTERNAL_ERROR
  }

  return {
    submissions: data || [],
    meta: { limit }
  };
}

async function getSubmission(id) {
  const serviceClient = supabaseLib.createServiceClient();

  // Full sensitive projection for authorized staff detail view
  const { data, error } = await serviceClient
    .from('production_submissions_studio')
    .select('id, project_id, user_id, source_type, source_provider, source_url, source_name, instructions, access_status, source_access_attested_at, submitted_at, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    const error = new Error('Submission not found');
    error.status = 404;
    error.code = 'SUBMISSION_NOT_FOUND';
    throw error;
  }

  return data;
}

module.exports = {
  listSubmissions,
  getSubmission
};
