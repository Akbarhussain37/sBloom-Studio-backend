const test = require('node:test');
const assert = require('node:assert');
const supertest = require('supertest');

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173';
process.env.NODE_ENV = 'test';

const authService = require('../src/services/authService');
const supabaseLib = require('../src/lib/supabase');
const app = require('../src/app');
const request = supertest(app);

test.describe('Admin Production Endpoints', () => {
  let originalVerifyTokenAndGetUser, originalGetUserProfile, originalCreateServiceClient;
  let serviceClientInvoked = false;
  let appliedLimit = null;
  let appliedAccessStatus = null;

  test.beforeEach(() => {
    originalVerifyTokenAndGetUser = authService.verifyTokenAndGetUser;
    originalGetUserProfile = authService.getUserProfile;
    originalCreateServiceClient = supabaseLib.createServiceClient;
    serviceClientInvoked = false;
    appliedLimit = null;
    appliedAccessStatus = null;

    // Spy on service client
    supabaseLib.createServiceClient = () => {
      serviceClientInvoked = true;
      return {
        from: (table) => ({
          select: (fields) => ({
            eq: (col, val) => {
              if (col === 'id' && val === '00000000-0000-4000-8000-000000000000') {
                 return { maybeSingle: async () => ({ data: null }) };
              }
              if (col === 'id' && val === '00000000-0000-4000-8000-111111111111') {
                 return { maybeSingle: async () => ({ error: new Error('Mock DB Error') }) };
              }
              return {
                maybeSingle: async () => ({
                  data: {
                    id: val,
                    project_id: 'some-proj',
                    user_id: 'user123',
                    source_type: 'FILE',
                    source_provider: 'GOOGLE_DRIVE',
                    source_url: 'https://secret.url',
                    source_name: 'test',
                    instructions: 'secret instructions',
                    access_status: 'PENDING_VERIFICATION',
                    source_access_attested_at: '2026-08-21T00:00:00.000Z',
                    submitted_at: '2026-08-21T00:00:00.000Z',
                    created_at: '2026-08-21T00:00:00.000Z',
                    updated_at: '2026-08-21T00:00:00.000Z'
                  }
                })
              };
            },
            order: () => {
              const chainable = {
                limit: (l) => {
                  appliedLimit = l;
                  return chainable;
                },
                eq: (col, val) => {
                  if (col === 'access_status') {
                    appliedAccessStatus = val;
                  }
                  return chainable;
                },
                then: (resolve) => resolve({
                  data: [
                    {
                      id: 'sub123',
                      project_id: 'proj1',
                      user_id: 'user1',
                      source_type: 'FILE',
                      source_provider: 'GOOGLE_DRIVE',
                      source_name: 'test',
                      access_status: 'PENDING_VERIFICATION',
                      submitted_at: '2026-08-21T00:00:00.000Z'
                    }
                  ],
                  error: null
                })
              };
              return chainable;
            }
          })
        })
      };
    };
  });

  test.afterEach(() => {
    authService.verifyTokenAndGetUser = originalVerifyTokenAndGetUser;
    authService.getUserProfile = originalGetUserProfile;
    supabaseLib.createServiceClient = originalCreateServiceClient;
  });

  const mockAuth = (role) => {
    authService.verifyTokenAndGetUser = async () => ({ id: 'u1', email: 'test@test.com' });
    authService.getUserProfile = async () => ({ id: 'u1', role, full_name: 'Test User' });
  };

  test.it('Queue: unauthenticated -> 401, service client NOT invoked', async () => {
    const res = await request.get('/api/admin/production/submissions');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(serviceClientInvoked, false);
  });

  test.it('Queue: creator -> 403, service client NOT invoked', async () => {
    mockAuth('creator');
    const res = await request.get('/api/admin/production/submissions').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error.code, 'STAFF_REQUIRED');
    assert.strictEqual(serviceClientInvoked, false);
  });

  test.it('Queue: kid -> 403', async () => {
    mockAuth('kid');
    const res = await request.get('/api/admin/production/submissions').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(serviceClientInvoked, false);
  });

  test.it('Queue: doctor -> 403', async () => {
    mockAuth('doctor');
    const res = await request.get('/api/admin/production/submissions').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(serviceClientInvoked, false);
  });

  test.it('Queue: production_staff -> 200, service client invoked', async () => {
    mockAuth('production_staff');
    const res = await request.get('/api/admin/production/submissions').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(serviceClientInvoked, true);
    assert.ok(res.body.submissions);
    assert.strictEqual(res.body.meta.limit, 50);
    const sub = res.body.submissions[0];
    assert.strictEqual(sub.source_url, undefined);
    assert.strictEqual(sub.instructions, undefined);
    assert.strictEqual(sub.source_access_attested_at, undefined);
  });

  test.it('Queue: admin -> 200', async () => {
    mockAuth('admin');
    const res = await request.get('/api/admin/production/submissions').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 200);
  });

  test.it('Queue: invalid limit -> 400', async () => {
    mockAuth('admin');
    const res = await request.get('/api/admin/production/submissions?limit=101').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(serviceClientInvoked, false);
  });

  test.it('Queue: limit=0 -> 400', async () => {
    mockAuth('admin');
    const res = await request.get('/api/admin/production/submissions?limit=0').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(serviceClientInvoked, false);
  });

  test.it('Queue: limit=-1 -> 400', async () => {
    mockAuth('admin');
    const res = await request.get('/api/admin/production/submissions?limit=-1').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(serviceClientInvoked, false);
  });

  test.it('Queue: limit=abc -> 400', async () => {
    mockAuth('admin');
    const res = await request.get('/api/admin/production/submissions?limit=abc').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(serviceClientInvoked, false);
  });

  test.it('Queue: valid explicit limit', async () => {
    mockAuth('admin');
    const res = await request.get('/api/admin/production/submissions?limit=25').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.meta.limit, 25);
    assert.strictEqual(appliedLimit, 25);
  });

  test.it('Queue: duplicate limit -> 400', async () => {
    mockAuth('admin');
    const res = await request.get('/api/admin/production/submissions?limit=10&limit=20').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    assert.strictEqual(serviceClientInvoked, false);
  });

  test.it('Queue: invalid access_status -> 400', async () => {
    mockAuth('admin');
    const res = await request.get('/api/admin/production/submissions?access_status=FOO').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(serviceClientInvoked, false);
  });

  test.it('Queue: duplicate access_status -> 400', async () => {
    mockAuth('admin');
    const res = await request.get('/api/admin/production/submissions?access_status=PENDING_VERIFICATION&access_status=ACCESS_REQUIRED').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    assert.strictEqual(serviceClientInvoked, false);
  });

  test.it('Queue: valid access_status applied', async () => {
    mockAuth('admin');
    const res = await request.get('/api/admin/production/submissions?access_status=PENDING_VERIFICATION').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(appliedAccessStatus, 'PENDING_VERIFICATION');
  });

  test.it('Queue: unexpected parameter -> 400', async () => {
    mockAuth('admin');
    const res = await request.get('/api/admin/production/submissions?foo=bar').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(serviceClientInvoked, false);
  });

  test.it('Detail: unauthenticated -> 401', async () => {
    const res = await request.get('/api/admin/production/submissions/123e4567-e89b-12d3-a456-426614174000');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(serviceClientInvoked, false);
  });

  test.it('Detail: creator -> 403', async () => {
    mockAuth('creator');
    const res = await request.get('/api/admin/production/submissions/123e4567-e89b-12d3-a456-426614174000').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(serviceClientInvoked, false);
  });

  test.it('Detail: malformed UUID -> 400', async () => {
    mockAuth('admin');
    const res = await request.get('/api/admin/production/submissions/not-a-uuid').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(serviceClientInvoked, false);
  });

  test.it('Detail: unknown UUID -> 404', async () => {
    mockAuth('admin');
    const res = await request.get('/api/admin/production/submissions/00000000-0000-4000-8000-000000000000').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 404);
  });

  test.it('Detail: operational DB error -> 500 (not 404)', async () => {
    mockAuth('admin');
    const res = await request.get('/api/admin/production/submissions/00000000-0000-4000-8000-111111111111').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.body.error.code, 'INTERNAL_ERROR');
  });

  test.it('Detail: admin -> 200, sensitive fields included', async () => {
    mockAuth('admin');
    const res = await request.get('/api/admin/production/submissions/123e4567-e89b-12d3-a456-426614174000').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.source_url, 'https://secret.url');
    assert.strictEqual(res.body.instructions, 'secret instructions');
  });

  test.it('Detail: production_staff -> 200, sensitive fields included', async () => {
    mockAuth('production_staff');
    const res = await request.get('/api/admin/production/submissions/123e4567-e89b-12d3-a456-426614174000').set('Authorization', 'Bearer 123');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.source_url, 'https://secret.url');
    assert.strictEqual(res.body.instructions, 'secret instructions');
  });

});
