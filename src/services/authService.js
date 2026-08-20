const supabaseLib = require('../lib/supabase');

async function verifyTokenAndGetUser(token) {
  const supabase = supabaseLib.getAuthClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    throw new Error('Invalid token');
  }
  
  return user;
}

async function getUserProfile(userId, accessToken) {
  const userClient = supabaseLib.createUserScopedClient(accessToken);
  const { data: profile, error } = await userClient
    .from('profile_studio')
    .select('id, role, full_name')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      const profileError = new Error('Profile required');
      profileError.code = 'PROFILE_REQUIRED';
      throw profileError;
    }
    // Propagate operational errors up to the centralized error handler
    throw error;
  }

  if (!profile) {
    const profileError = new Error('Profile required');
    profileError.code = 'PROFILE_REQUIRED';
    throw profileError;
  }

  return profile;
}

module.exports = {
  verifyTokenAndGetUser,
  getUserProfile,
};
