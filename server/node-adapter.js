// Adapts a Node (req, res) pair to the shared API handler.
// Every production /api request passes through authentication here.
import { handle } from './handler.js';
import { fail, errorResponse } from './http.js';
import { ensureSchema } from './database/db.js';
import {
  signup, signin, verifyEmail, resendVerification, sessionUser, logout,
  sessionCookie, clearSessionCookie,
} from './services/authService.js';

async function readBody(req) {
  if (['GET', 'HEAD'].includes(String(req.method).toUpperCase())) return undefined;
  let raw = req.body;
  if (raw === undefined) {
    const chunks = [];
    let total = 0;
    for await (const c of req) {
      total += c.length;
      if (total > 16000) throw Object.assign(new Error('Request too large'), { status: 413 });
      chunks.push(c);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (typeof raw !== 'string') return raw;
  return raw.trim() ? JSON.parse(raw) : undefined;
}

const authRoutes = new Set(['/api/auth/signup', '/api/auth/signin', '/api/auth/verify-email', '/api/auth/resend-verification', '/api/auth/logout', '/api/auth/me']);
const businessRoutes = new Set(['products', 'clients', 'invoice-fields', 'dashboard-filters', 'timeline-stages', 'invoices', 'dashboard', 'filters']);
const isMutation = (method) => !['GET', 'HEAD', 'OPTIONS'].includes(method);
const toObject = (headers = {}) => Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));

// Compare to the origin of THIS request, not APP_BASE_URL (which is only for
// verification links). Vercel preview URLs and production custom domains differ.
function sameOrigin(req, headers) {
  if (headers['sec-fetch-site'] === 'cross-site') return false;
  if (!headers.origin) return true; // Native clients may not send Origin.
  try {
    const origin = new URL(headers.origin);
    if (!['http:', 'https:'].includes(origin.protocol)) return false;
    const protocol = isSecure(req, headers) ? 'https:' : 'http:';
    const hosts = [headers['x-forwarded-host'], headers.host]
      .filter((value) => typeof value === 'string' && value.trim())
      .map((value) => value.split(',')[0].trim());
    return hosts.some((host) => {
      try { return new URL(`${protocol}//${host}`).origin === origin.origin; }
      catch { return false; }
    });
  } catch { return false; }
}

function isSecure(req, headers) {
  return Boolean(process.env.VERCEL) || headers['x-forwarded-proto'] === 'https' || Boolean(req.socket?.encrypted);
}

async function authenticatedRoute(path, method, body, headers, ip, secure) {
  const user = await sessionUser(headers);
  if (path === '/api/auth/me' && method === 'GET') {
    return { status: 200, body: { user: user || null } };
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    await logout(headers);
    return { status: 200, body: { message: 'Signed out' }, cookie: clearSessionCookie(secure) };
  }
  if (path === '/api/auth/signup' && method === 'POST') return { status: 200, body: await signup(body, ip) };
  if (path === '/api/auth/resend-verification' && method === 'POST') return { status: 200, body: await resendVerification(body, ip) };
  if (path === '/api/auth/verify-email' && method === 'POST') return { status: 200, body: await verifyEmail(body?.token) };
  if (path === '/api/auth/signin' && method === 'POST') {
    const result = await signin(body, ip);
    return { status: 200, body: { user: result.user }, cookie: sessionCookie(result.token, secure) };
  }
  return fail(404, 'NOT_FOUND', 'Unknown endpoint');
}

export async function nodeHandler(req, res) {
  let r;
  const headers = toObject(req.headers);
  const secure = isSecure(req, headers);
  try {
    const url = new URL(req.url, 'http://localhost');
    const method = String(req.method || 'GET').toUpperCase();
    let body;
    try { body = await readBody(req); } catch {
      r = fail(400, 'BAD_REQUEST', 'Malformed or oversized JSON body');
    }
    if (!r && isMutation(method) && !sameOrigin(req, headers)) {
      r = fail(403, 'INVALID_ORIGIN', 'Request origin is not allowed');
    }
    const ip = String(headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].slice(0, 64);
    if (!r && authRoutes.has(url.pathname)) {
      await ensureSchema();
      r = await authenticatedRoute(url.pathname, method, body, headers, ip, secure);
    }
    if (!r && url.pathname.startsWith('/api/') && businessRoutes.has(url.pathname.split('/')[2])) {
      await ensureSchema();
      const user = await sessionUser(headers);
      r = user
        ? await handle({ method, path: url.pathname, query: Object.fromEntries(url.searchParams), body })
        : fail(401, 'AUTH_REQUIRED', 'Sign in to continue');
    }
    if (!r) r = await handle({ method, path: url.pathname, query: Object.fromEntries(url.searchParams), body });
  } catch (e) {
    r = errorResponse(e);
  }
  res.statusCode = r.status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (r.cookie) res.setHeader('Set-Cookie', r.cookie);
  if (r.body === undefined) return res.end();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(r.body));
}
