const { getAuthClient, createUserScopedClient } = require('../lib/supabase');

async function verifyTokenAndGetUser(token) {
  const supabase = getAuthClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    throw new Error('Invalid token');
  }
  
  return user;
}

async function getUserProfile(userId, accessToken) {
  const userClient = createUserScopedClient(accessToken);
  const { data: profile, error } = await userClient
    .from('profile_studio')
    .select('id, role, full_name')
    .eq('id', userId)
    .single();

  if (error || !profile) {
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
