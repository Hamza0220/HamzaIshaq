/**
 * SecurityHeaders.test.ts
 * Verifies that Helmet sets the required security headers on all responses.
 */

import request from 'supertest';
import { createApp } from '../../../src/app';

const app = createApp();

describe('Security Headers (Helmet)', () => {
  it('sets x-content-type-options on GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets x-frame-options on GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('sets strict-transport-security on GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('returns 200 with status ok from /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
