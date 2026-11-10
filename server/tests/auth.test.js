import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { nodeHandler } from '../node-adapter.js';
import { resetDb } from '../database/db.js';

let emailMessage;
let oldEnv;
let oldFetch;

const request = async (method, url, body, cookie = '') => {
  const headers = { host: 'localhost:5173', origin: 'http://localhost:5173', cookie };
  const req = { method, url, headers, body, socket: { remoteAddress: '127.0.0.1' } };
  const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.output = value; } };
  await nodeHandler(req, response);
  return { status: response.statusCode, body: response.output ? JSON.parse(response.output) : null, cookie: response.headers['Set-Cookie'] };
};
const signup = (email, password = '12345678') => request('POST', '/api/auth/signup', { name: 'Test User', email, password, employee_id: 'EMP-1' });
const password = '12345678';
const testInvoice = { date_issued: '2026-11-10', invoice_prefix: 'SI', client_name: 'Example Client', product_service: 'IT Services', amount: 100, payment_status: 'Pending', amount_paid: 0 };

beforeAll(() => {
  oldEnv = { ...process.env };
  oldFetch = globalThis.fetch;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idt-auth-'));
  process.env.TURSO_DATABASE_URL = 'file:' + path.join(dir, 'auth.db');
  process.env.AUTH_ALLOWED_DOMAINS = 'example.com';
  process.env.APP_BASE_URL = 'http://localhost:5173';
  process.env.RESEND_API_KEY = 'test-api-key';
  process.env.AUTH_FROM_EMAIL = 'Invoice Tracker <verify@example.com>';
  delete process.env.VERCEL;
  resetDb();
  globalThis.fetch = async (_url, options) => {
    emailMessage = JSON.parse(options.body);
    return { ok: true, status: 200 };
  };
});
afterAll(() => { globalThis.fetch = oldFetch; process.env = oldEnv; resetDb(); });

describe('authenticated company workspace', () => {
  it('rejects public-domain account registrations and invalid 8-digit PINs', async () => {
    expect((await signup('person@gmail.com')).status).toBe(422);
    expect((await signup('person@example.com', 'password')).status).toBe(422);
  });

  it('blocks unverified sign-in and all unauthenticated business APIs', async () => {
    expect((await signup('person@example.com')).status).toBe(200);
    expect(emailMessage.to).toEqual(['person@example.com']);
    expect(emailMessage.html).toContain('Verify email');
    expect((await request('GET', '/api/invoices')).status).toBe(401);
    expect((await request('POST', '/api/auth/signin', { email: 'person@example.com', password })).status).toBe(403);
  });

  it('consumes verification links once, signs in, and invalidates sessions at logout', async () => {
    const link = emailMessage.text.match(/http:\/\/localhost:5173\/verify-email\?token=([^\s]+)/)?.[1];
    expect(link).toBeTruthy();
    const verified = await request('POST', '/api/auth/verify-email', { token: link });
    expect(verified.status).toBe(200);
    expect((await request('POST', '/api/auth/verify-email', { token: link })).status).toBe(400);
    const signed = await request('POST', '/api/auth/signin', { email: 'person@example.com', password });
    expect(signed.status).toBe(200);
    expect(signed.body.user.email).toBe('person@example.com');
    expect(signed.cookie).toContain('HttpOnly');
    expect(signed.cookie).toContain('SameSite=Lax');
    const cookie = signed.cookie.split(';')[0];
    expect((await request('GET', '/api/auth/me', undefined, cookie)).status).toBe(200);
    expect((await request('POST', '/api/invoices', testInvoice, cookie)).status).toBe(201);
    expect((await request('GET', '/api/invoices', undefined, cookie)).status).toBe(200);
    expect((await request('POST', '/api/auth/logout', {}, cookie)).status).toBe(200);
    expect((await request('GET', '/api/invoices', undefined, cookie)).status).toBe(401);
  });

  it('rejects cross-origin mutating requests', async () => {
    const req = { method: 'POST', url: '/api/auth/signin', headers: { host: 'localhost:5173', origin: 'https://evil.example' }, body: { email: 'person@example.com', password } };
    const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.output = b; } };
    await nodeHandler(req, response);
    expect(response.statusCode).toBe(403);
  });
});
