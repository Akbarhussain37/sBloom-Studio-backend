require('dotenv').config();

const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'CORS_ALLOWED_ORIGINS'];
const missing = requiredEnvVars.filter((v) => !process.env[v]);

if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },
  cors: {
    allowedOrigins: process.env.CORS_ALLOWED_ORIGINS 
      ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
      : [],
  }
};

module.exports = config;
