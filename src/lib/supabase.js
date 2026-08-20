const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

function createUserScopedClient(accessToken) {
  if (!accessToken) {
    throw new Error('Access token is required to create a user-scoped client.');
  }

  return createClient(config.supabase.url, config.supabase.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function getAuthClient() {
  return createClient(config.supabase.url, config.supabase.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    }
  });
}

module.exports = {
  createUserScopedClient,
  getAuthClient
};
