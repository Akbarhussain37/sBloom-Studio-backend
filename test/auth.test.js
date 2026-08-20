const test = require('node:test');
const assert = require('node:assert');
const supertest = require('supertest');

// Set up environment variables for testing
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-key';
process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173,http://allowed.com';
process.env.NODE_ENV = 'test';

// Import the service so we can mock its methods
const authService = require('../src/services/authService');
const supabaseLib = require('../src/lib/supabase');

// Save original functions to restore them later
const originalVerifyTokenAndGetUser = authService.verifyTokenAndGetUser;
const originalGetUserProfile = authService.getUserProfile;

// Import the app after setting env vars
const app = require('../src/app');
const request = supertest(app);

test.describe('Auth and Health Routes', () => {
  test.afterEach(() => {
    // Restore mocks
    authService.verifyTokenAndGetUser = originalVerifyTokenAndGetUser;
    authService.getUserProfile = originalGetUserProfile;
  });

  test.it('GET /api/health -> 200', async () => {
    const res = await request.get('/api/health');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { status: 'ok' });
  });

  test.it('GET /api/auth/me without Authorization -> 401', async () => {
    const res = await request.get('/api/auth/me');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
  });

  test.it('malformed Authorization scheme -> 401', async () => {
    const res = await request.get('/api/auth/me').set('Authorization', 'Basic 123');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
  });

  test.it('simulated invalid/expired token -> 401', async () => {
    authService.verifyTokenAndGetUser = async () => {
      throw new Error('Invalid token');
    };
    const res = await request.get('/api/auth/me').set('Authorization', 'Bearer bad-token');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
  });

  test.it('valid authenticated Creator /api/auth/me -> 200', async () => {
    authService.verifyTokenAndGetUser = async (token) => ({ id: 'u1', email: 'creator@test.com' });
    authService.getUserProfile = async (id, token) => ({ id: 'u1', role: 'creator', full_name: 'Creator One' });
    
    const res = await request.get('/api/auth/me').set('Authorization', 'Bearer good-creator-token');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, {
      user: { id: 'u1', email: 'creator@test.com' },
      profile: { role: 'creator' }
    });
    // Ensure response bodies never contain the Bearer token used in tests
    assert.strictEqual(JSON.stringify(res.body).includes('good-creator-token'), false);
  });

  test.it('valid authenticated Creator /api/creator/me -> 200', async () => {
    authService.verifyTokenAndGetUser = async (token) => ({ id: 'u1', email: 'creator@test.com' });
    authService.getUserProfile = async (id, token) => ({ id: 'u1', role: 'creator', full_name: 'Creator One' });
    
    const res = await request.get('/api/creator/me').set('Authorization', 'Bearer good-creator-token');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, {
      user: { id: 'u1', email: 'creator@test.com' },
      profile: { role: 'creator' }
    });
  });

  test.it('authenticated Kid/non-creator /api/auth/me -> 200', async () => {
    authService.verifyTokenAndGetUser = async (token) => ({ id: 'u2', email: 'kid@test.com' });
    authService.getUserProfile = async (id, token) => ({ id: 'u2', role: 'kid', full_name: 'Kid One' });
    
    const res = await request.get('/api/auth/me').set('Authorization', 'Bearer good-kid-token');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.profile.role, 'kid');
  });

  test.it('authenticated Kid/non-creator /api/creator/me -> 403', async () => {
    authService.verifyTokenAndGetUser = async (token) => ({ id: 'u2', email: 'kid@test.com' });
    authService.getUserProfile = async (id, token) => ({ id: 'u2', role: 'kid', full_name: 'Kid One' });
    
    const res = await request.get('/api/creator/me').set('Authorization', 'Bearer good-kid-token');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error.code, 'CREATOR_REQUIRED');
  });

  test.it('authenticated user with missing profile -> 403 PROFILE_REQUIRED', async () => {
    authService.verifyTokenAndGetUser = async (token) => ({ id: 'u3', email: 'missing@test.com' });
    authService.getUserProfile = async (id, token) => {
      const err = new Error('Profile required');
      err.code = 'PROFILE_REQUIRED';
      throw err;
    };
    
    const res = await request.get('/api/auth/me').set('Authorization', 'Bearer valid-token-no-profile');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error.code, 'PROFILE_REQUIRED');
  });

  test.it('Supabase profile lookup returns an operational error -> 500 INTERNAL_ERROR', async () => {
    authService.verifyTokenAndGetUser = async (token) => ({ id: 'u_db_err', email: 'db_err@test.com' });

    const originalCreateClient = supabaseLib.createUserScopedClient;
    supabaseLib.createUserScopedClient = () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ error: { code: 'PGRST500', message: 'simulated database failure' }, data: null })
          })
        })
      })
    });

    // Mock console.error
    const originalConsoleError = console.error;
    let loggedMessages = [];
    console.error = (msg) => { loggedMessages.push(msg); };

    const res = await request.get('/api/auth/me').set('Authorization', 'Bearer valid-token');

    // Restore mocks
    console.error = originalConsoleError;
    supabaseLib.createUserScopedClient = originalCreateClient;

    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.body.error.code, 'INTERNAL_ERROR');

    const bodyStr = JSON.stringify(res.body);
    assert.strictEqual(bodyStr.includes('simulated database failure'), false);
    assert.strictEqual(bodyStr.includes('valid-token'), false);

    // Verify logs
    const logsStr = loggedMessages.join(' ');
    assert.strictEqual(logsStr.includes('simulated database failure'), false);
    assert.strictEqual(logsStr.includes('valid-token'), false);
    assert.strictEqual(logsStr.includes('test-key'), false);
  });

  test.it('Supabase profile lookup returns PGRST116 -> 403 PROFILE_REQUIRED', async () => {
    authService.verifyTokenAndGetUser = async (token) => ({ id: 'u_116', email: '116@test.com' });

    const originalCreateClient = supabaseLib.createUserScopedClient;
    supabaseLib.createUserScopedClient = () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, data: null })
          })
        })
      })
    });

    const res = await request.get('/api/auth/me').set('Authorization', 'Bearer valid-token');

    supabaseLib.createUserScopedClient = originalCreateClient;

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error.code, 'PROFILE_REQUIRED');
  });

  test.it('allowed CORS origin -> correct Access-Control-Allow-Origin', async () => {
    const res = await request.get('/api/health').set('Origin', 'http://localhost:5173');
    assert.strictEqual(res.headers['access-control-allow-origin'], 'http://localhost:5173');
  });

  test.it('disallowed browser origin -> rejected CORS', async () => {
    const res = await request.get('/api/health').set('Origin', 'http://evil.com');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error.code, 'CORS_ORIGIN_DENIED');
  });

  test.it('GET /api/does-not-exist -> 404 NOT_FOUND', async () => {
    const res = await request.get('/api/does-not-exist');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error.code, 'NOT_FOUND');
  });

  test.it('oversized JSON -> rejected with safe error', async () => {
    const largePayload = { data: 'a'.repeat(150 * 1024) };
    const res = await request.post('/api/health').set('Content-Type', 'application/json').send(largePayload);
    assert.strictEqual(res.status, 413);
    assert.strictEqual(res.body.error.code, 'PAYLOAD_TOO_LARGE');
  });

  test.it('Bearer token is never returned in response bodies.', async () => {
    authService.verifyTokenAndGetUser = async (token) => ({ id: 'u4', email: 'leak@test.com' });
    authService.getUserProfile = async (id, token) => ({ id: 'u4', role: 'creator', full_name: 'Leak Test' });
    
    const token = 'e2a-secret-bearer-token-must-never-leak';
    const resAuth = await request.get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    assert.strictEqual(resAuth.status, 200);
    assert.strictEqual(JSON.stringify(resAuth.body).includes(token), false);

    const resCreator = await request.get('/api/creator/me').set('Authorization', `Bearer ${token}`);
    assert.strictEqual(resCreator.status, 200);
    assert.strictEqual(JSON.stringify(resCreator.body).includes(token), false);
    
    authService.getUserProfile = async () => {
      const err = new Error('Profile required'); err.code = 'PROFILE_REQUIRED'; throw err;
    };
    const resErr = await request.get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    assert.strictEqual(resErr.status, 403);
    assert.strictEqual(JSON.stringify(resErr.body).includes(token), false);
  });
});
