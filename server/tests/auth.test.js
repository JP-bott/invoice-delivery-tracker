import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { nodeHandler } from '../node-adapter.js';
import { getDb, resetDb } from '../database/db.js';

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
  it('reports unavailable signup and refuses to store accounts if settings are missing', async () => {
    const previous = {
      domains: process.env.AUTH_ALLOWED_DOMAINS, emails: process.env.AUTH_ALLOWED_EMAILS,
      key: process.env.RESEND_API_KEY, sender: process.env.AUTH_FROM_EMAIL,
    };
    try {
      delete process.env.AUTH_ALLOWED_DOMAINS;
      delete process.env.AUTH_ALLOWED_EMAILS;
      const status = await request('GET', '/api/auth/signup-status');
      expect(status.status).toBe(200);
      expect(status.body.enabled).toBe(false);
      expect(status.body).not.toHaveProperty('domains');
      const result = await signup('unconfigured@example.com');
      expect(result.status).toBe(503);
      expect(result.body.error.code).toBe('AUTH_NOT_CONFIGURED');
      const rows = await getDb().execute({ sql: 'SELECT id FROM users WHERE email = ?', args: ['unconfigured@example.com'] });
      expect(rows.rows).toHaveLength(0);
      process.env.AUTH_ALLOWED_DOMAINS = 'example.com';
      delete process.env.RESEND_API_KEY;
      expect((await signup('no-mail@example.com')).status).toBe(503);
      const after = await getDb().execute({ sql: 'SELECT id FROM users WHERE email = ?', args: ['no-mail@example.com'] });
      expect(after.rows).toHaveLength(0);
    } finally {
      if (previous.domains === undefined) delete process.env.AUTH_ALLOWED_DOMAINS;
      else process.env.AUTH_ALLOWED_DOMAINS = previous.domains;
      if (previous.emails === undefined) delete process.env.AUTH_ALLOWED_EMAILS;
      else process.env.AUTH_ALLOWED_EMAILS = previous.emails;
      if (previous.key === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previous.key;
      if (previous.sender === undefined) delete process.env.AUTH_FROM_EMAIL;
      else process.env.AUTH_FROM_EMAIL = previous.sender;
    }
    expect((await request('GET', '/api/auth/signup-status')).body.enabled).toBe(true);
  });

  it('allows an explicitly authorized individual email without opening its entire domain', async () => {
    const oldDomains = process.env.AUTH_ALLOWED_DOMAINS;
    const oldEmails = process.env.AUTH_ALLOWED_EMAILS;
    try {
      delete process.env.AUTH_ALLOWED_DOMAINS;
      process.env.AUTH_ALLOWED_EMAILS = 'approved-person@gmail.com';
      expect((await signup('someone-else@gmail.com')).status).toBe(422);
      expect((await signup('approved-person@gmail.com')).status).toBe(200);
      expect(emailMessage.to).toEqual(['approved-person@gmail.com']);
    } finally {
      if (oldDomains === undefined) delete process.env.AUTH_ALLOWED_DOMAINS;
      else process.env.AUTH_ALLOWED_DOMAINS = oldDomains;
      if (oldEmails === undefined) delete process.env.AUTH_ALLOWED_EMAILS;
      else process.env.AUTH_ALLOWED_EMAILS = oldEmails;
    }
  });
  it('rejects public-domain account registrations and invalid 8-digit PINs', async () => {
    expect((await signup('person@gmail.com')).status).toBe(422);
    expect((await signup('person@example.com', 'password')).status).toBe(422);
  });

  it('blocks unverified sign-in and all unauthenticated business APIs', async () => {
    expect((await signup('person@example.com')).status).toBe(200);
    expect(emailMessage.to).toEqual(['person@example.com']);
    expect(emailMessage.html).toContain('Verify email');
    expect((await request('GET', '/api/invoices')).status).toBe(401);
    expect((await request('GET', '/api/auth/me')).body).toEqual({ user: null });
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

  it('accepts legitimate Vercel production and preview origins even when APP_BASE_URL points elsewhere', async () => {
    const originalVercel = process.env.VERCEL;
    const previousBase = process.env.APP_BASE_URL;
    process.env.VERCEL = '1';
    process.env.APP_BASE_URL = 'https://production.example.com';
    try {
      for (const host of ['production.example.com', 'invoice-preview-123.vercel.app']) {
        const req = {
          method: 'POST', url: '/api/auth/signup',
          headers: { host, 'x-forwarded-host': host, 'x-forwarded-proto': 'https', origin: `https://${host}`, 'sec-fetch-site': 'same-origin', 'x-forwarded-for': '203.0.113.80' },
          body: { name: 'Test User', email: 'extra@example.com', password: '12345678' },
        };
        const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.output = b; } };
        await nodeHandler(req, res);
        expect(res.statusCode).not.toBe(403);
      }
    } finally {
      if (originalVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = originalVercel;
      process.env.APP_BASE_URL = previousBase;
    }
  });

  it('rejects cross-origin mutating requests', async () => {
    const req = { method: 'POST', url: '/api/auth/signin', headers: { host: 'localhost:5173', origin: 'https://evil.example' }, body: { email: 'person@example.com', password } };
    const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.output = b; } };
    await nodeHandler(req, response);
    expect(response.statusCode).toBe(403);
  });
});
