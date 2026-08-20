const test = require('node:test');
const assert = require('node:assert');
const supertest = require('supertest');
const http = require('http');
const https = require('https');

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173';
process.env.NODE_ENV = 'test';

const authService = require('../src/services/authService');
const supabaseLib = require('../src/lib/supabase');
const app = require('../src/app');
const request = supertest(app);

const validPayload = {
  project_id: '123e4567-e89b-12d3-a456-426614174000',
  source_type: 'FILE',
  source_provider: 'GOOGLE_DRIVE',
  source_url: 'https://drive.google.com/file/d/123/view?usp=sharing',
  source_name: 'My Project Source',
  instructions: 'Please edit this file.',
  source_access_attested: true
};

test.describe('Production Submission Endpoint', () => {
  let originalVerifyTokenAndGetUser, originalGetUserProfile, originalCreateUserScopedClient, originalCreateServiceClient;
  let originalConsoleError, originalFetch;

  test.beforeEach(() => {
    originalVerifyTokenAndGetUser = authService.verifyTokenAndGetUser;
    originalGetUserProfile = authService.getUserProfile;
    originalCreateUserScopedClient = supabaseLib.createUserScopedClient;
    originalCreateServiceClient = supabaseLib.createServiceClient;
    originalConsoleError = console.error;
    originalFetch = global.fetch;

    // Fail hard if any network requests are made via fetch
    global.fetch = () => Promise.reject(new Error('Network fetch is forbidden'));
  });

  test.afterEach(() => {
    authService.verifyTokenAndGetUser = originalVerifyTokenAndGetUser;
    authService.getUserProfile = originalGetUserProfile;
    supabaseLib.createUserScopedClient = originalCreateUserScopedClient;
    supabaseLib.createServiceClient = originalCreateServiceClient;
    console.error = originalConsoleError;
    global.fetch = originalFetch;
  });

  const mockCreatorAuth = () => {
    authService.verifyTokenAndGetUser = async () => ({ id: 'creator-u1', email: 'creator@test.com' });
    authService.getUserProfile = async () => ({ id: 'creator-u1', role: 'creator', full_name: 'Creator' });
  };

  const mockKidAuth = () => {
    authService.verifyTokenAndGetUser = async () => ({ id: 'kid-u1', email: 'kid@test.com' });
    authService.getUserProfile = async () => ({ id: 'kid-u1', role: 'kid', full_name: 'Kid' });
  };

  const mockSuccessfulDB = (insertedOverride = {}) => {
    supabaseLib.createUserScopedClient = () => ({
      from: () => ({
        select: () => ({
          eq: (field, val1) => ({
            eq: (field, val2) => ({
              maybeSingle: async () => ({ data: { id: validPayload.project_id }, error: null })
            })
          })
        })
      })
    });

    supabaseLib.createServiceClient = () => ({
      from: () => ({
        insert: (payload) => {
          // Store payload for assertions if needed
          global.__lastInsertPayload = payload;
          return {
            select: () => ({
              single: async () => ({
                data: {
                  id: 'sub-1',
                  project_id: payload.project_id,
                  source_type: payload.source_type,
                  source_provider: payload.source_provider,
                  source_name: payload.source_name,
                  access_status: 'PENDING_VERIFICATION',
                  submitted_at: new Date().toISOString(),
                  ...insertedOverride
                },
                error: null
              })
            })
          };
        }
      })
    });
  };

  test.it('unauthenticated POST -> 401', async () => {
    const res = await request.post('/api/production/submissions').send(validPayload);
    assert.strictEqual(res.status, 401);
  });

  test.it('Kid/non-Creator POST -> 403 CREATOR_REQUIRED', async () => {
    mockKidAuth();
    const res = await request.post('/api/production/submissions')
      .set('Authorization', 'Bearer kid-token')
      .send(validPayload);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error.code, 'CREATOR_REQUIRED');
  });

  test.it('user_id cannot be client-controlled -> 400', async () => {
    mockCreatorAuth();
    const payload = { ...validPayload, user_id: 'malicious-id' };
    const res = await request.post('/api/production/submissions')
      .set('Authorization', 'Bearer creator-token')
      .send(payload);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    assert.strictEqual(res.body.error.message.includes('user_id'), true);
  });

  test.it('other restricted fields cannot be client-controlled -> 400', async () => {
    mockCreatorAuth();
    const res = await request.post('/api/production/submissions')
      .set('Authorization', 'Bearer creator-token')
      .send({ ...validPayload, access_status: 'ACCESS_CONFIRMED' });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
  });

  test.it('source_access_attested missing -> 400', async () => {
    mockCreatorAuth();
    const payload = { ...validPayload };
    delete payload.source_access_attested;
    const res = await request.post('/api/production/submissions')
      .set('Authorization', 'Bearer creator-token')
      .send(payload);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.code, 'SOURCE_ACCESS_ATTESTATION_REQUIRED');
  });

  test.it('source_access_attested false -> 400', async () => {
    mockCreatorAuth();
    const payload = { ...validPayload, source_access_attested: false };
    const res = await request.post('/api/production/submissions')
      .set('Authorization', 'Bearer creator-token')
      .send(payload);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.code, 'SOURCE_ACCESS_ATTESTATION_REQUIRED');
  });

  test.it('source_access_attested string "true" -> 400', async () => {
    mockCreatorAuth();
    const payload = { ...validPayload, source_access_attested: "true" };
    const res = await request.post('/api/production/submissions')
      .set('Authorization', 'Bearer creator-token')
      .send(payload);
    assert.strictEqual(res.status, 400);
  });

  test.it('invalid UUID for project_id -> 400', async () => {
    mockCreatorAuth();
    const res = await request.post('/api/production/submissions')
      .set('Authorization', 'Bearer creator-token')
      .send({ ...validPayload, project_id: 'not-a-uuid' });
    assert.strictEqual(res.status, 400);
  });

  test.it('invalid source_type -> 400', async () => {
    mockCreatorAuth();
    const res = await request.post('/api/production/submissions')
      .set('Authorization', 'Bearer creator-token')
      .send({ ...validPayload, source_type: 'INVALID' });
    assert.strictEqual(res.status, 400);
  });

  test.it('invalid source_provider -> 400', async () => {
    mockCreatorAuth();
    const res = await request.post('/api/production/submissions')
      .set('Authorization', 'Bearer creator-token')
      .send({ ...validPayload, source_provider: 'AWS' });
    assert.strictEqual(res.status, 400);
  });

  test.it('malformed source_url -> 400', async () => {
    mockCreatorAuth();
    const res = await request.post('/api/production/submissions')
      .set('Authorization', 'Bearer creator-token')
      .send({ ...validPayload, source_url: 'not-a-url' });
    assert.strictEqual(res.status, 400);
  });

  test.it('http:// source_url -> 400', async () => {
    mockCreatorAuth();
    const res = await request.post('/api/production/submissions')
      .set('Authorization', 'Bearer creator-token')
      .send({ ...validPayload, source_url: 'http://drive.google.com/file' });
    assert.strictEqual(res.status, 400);
  });

  test.it('source_url > 2048 -> 400', async () => {
    mockCreatorAuth();
    const res = await request.post('/api/production/submissions')
      .set('Authorization', 'Bearer creator-token')
      .send({ ...validPayload, source_url: 'https://a.com/' + 'a'.repeat(2040) });
    assert.strictEqual(res.status, 400);
  });

  test.it('blank instructions -> 400', async () => {
    mockCreatorAuth();
    const res = await request.post('/api/production/submissions')
      .set('Authorization', 'Bearer creator-token')
      .send({ ...validPayload, instructions: '   ' });
    assert.strictEqual(res.status, 400);
  });

  test.it('instructions > 5000 -> 400', async () => {
    mockCreatorAuth();
    const res = await request.post('/api/production/submissions')
      .set('Authorization', 'Bearer creator-token')
      .send({ ...validPayload, instructions: 'a'.repeat(5001) });
    assert.strictEqual(res.status, 400);
  });

  test.it('source_name normalized to null if blank', async () => {
    mockCreatorAuth();
    mockSuccessfulDB();
    const res = await request.post('/api/production/submissions')
      .set('Authorization', 'Bearer creator-token')
      .send({ ...validPayload, source_name: '   ' });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(global.__lastInsertPayload.source_name, null);
  });

  test.it('project not found -> 404 PROJECT_NOT_FOUND', async () => {
    mockCreatorAuth();
    supabaseLib.createUserScopedClient = () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null })
            })
          })
        })
      })
    });
    const res = await request.post('/api/production/submissions')
      .set('Authorization', 'Bearer creator-token')
      .send(validPayload);
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error.code, 'PROJECT_NOT_FOUND');
  });

  test.it('foreign project -> 404 PROJECT_NOT_FOUND', async () => {
    // Exact same outcome as project not found since we query by user_id
    mockCreatorAuth();
    supabaseLib.createUserScopedClient = () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null })
            })
          })
        })
      })
    });
    const res = await request.post('/api/production/submissions')
      .set('Authorization', 'Bearer creator-token')
      .send(validPayload);
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error.code, 'PROJECT_NOT_FOUND');
  });

  test.it('operational project lookup failure -> 500 INTERNAL_ERROR', async () => {
    mockCreatorAuth();
    let loggedMessages = [];
    console.error = (msg) => { loggedMessages.push(msg); };

    supabaseLib.createUserScopedClient = () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: { code: 'PGRST500', message: 'db error' } })
            })
          })
        })
      })
    });
    const res = await request.post('/api/production/submissions')
      .set('Authorization', 'Bearer creator-token')
      .send(validPayload);
    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.body.error.code, 'INTERNAL_ERROR');
    const logs = loggedMessages.join(' ');
    assert.strictEqual(logs.includes('db error'), false);
  });

  test.it('service-role insert failure -> 500 INTERNAL_ERROR', async () => {
    mockCreatorAuth();
    let loggedMessages = [];
    console.error = (msg) => { loggedMessages.push(msg); };

    supabaseLib.createUserScopedClient = () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: validPayload.project_id }, error: null })
            })
          })
        })
      })
    });

    supabaseLib.createServiceClient = () => ({
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: { code: 'PGRST500', message: 'insert error' }
            })
          })
        })
      })
    });

    const res = await request.post('/api/production/submissions')
      .set('Authorization', 'Bearer creator-token')
      .send(validPayload);
    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.body.error.code, 'INTERNAL_ERROR');
    const logs = loggedMessages.join(' ');
    assert.strictEqual(logs.includes('insert error'), false);
  });

  test.it('Creator valid submission -> 201, verifies payload and response', async () => {
    mockCreatorAuth();
    mockSuccessfulDB();

    let loggedMessages = [];
    console.error = (msg) => { loggedMessages.push(msg); };

    const res = await request.post('/api/production/submissions')
      .set('Authorization', 'Bearer creator-token')
      .send(validPayload);

    assert.strictEqual(res.status, 201);

    // Check insert payload
    const payload = global.__lastInsertPayload;
    assert.strictEqual(payload.user_id, 'creator-u1'); // user_id derived
    assert.strictEqual(typeof payload.source_access_attested_at, 'string'); // server derived
    assert.strictEqual(payload.access_status, undefined); // not explicitly set
    assert.strictEqual(payload.submitted_at, undefined);
    assert.strictEqual(payload.created_at, undefined);
    assert.strictEqual(payload.updated_at, undefined);

    // Check response excludes sensitive fields
    const resBody = res.body.submission;
    assert.strictEqual(resBody.source_url, undefined);
    assert.strictEqual(resBody.instructions, undefined);
    assert.strictEqual(resBody.user_id, undefined);
    assert.strictEqual(resBody.id, 'sub-1');
    assert.strictEqual(resBody.access_status, 'PENDING_VERIFICATION');

    const bodyStr = JSON.stringify(res.body);
    assert.strictEqual(bodyStr.includes(validPayload.source_url), false);
    assert.strictEqual(bodyStr.includes(validPayload.instructions), false);
    assert.strictEqual(bodyStr.includes('creator-u1'), false);
    assert.strictEqual(bodyStr.includes('test-service-role-key'), false);

    // Check logs exclude sensitive fields
    const logsStr = loggedMessages.join(' ');
    assert.strictEqual(logsStr.includes(validPayload.source_url), false);
    assert.strictEqual(logsStr.includes('creator-token'), false);
    assert.strictEqual(logsStr.includes('test-service-role-key'), false);
  });
});
