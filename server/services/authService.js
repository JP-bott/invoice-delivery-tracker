import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { getDb } from '../database/db.js';
import { HttpError } from '../http.js';

const scrypt = promisify(scryptCallback);
const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
const now = () => new Date().toISOString();
const SESSION_DAYS = 7;
const EMAIL_HOURS = 24;
const BAD_LOGIN = 'Invalid email or password';
const cookieName = 'idt_session';

const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email,
  employee_id: u.employee_id ?? null, verified: Boolean(u.verified_at),
});
const httpError = (status, message, code) => new HttpError(status, message, code);

function validEmail(raw) {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
function signupAllowlist() {
  // An explicit address is useful for a small team with personal mailboxes.
  // Do not authorize all gmail.com or other public email providers by default.
  const domains = (process.env.AUTH_ALLOWED_DOMAINS || '').split(',')
    .map((s) => s.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
  const emails = (process.env.AUTH_ALLOWED_EMAILS || '').split(',')
    .map((s) => s.trim().toLowerCase()).filter(Boolean);
  return { domains, emails };
}
function allowedEmail(email) {
  const { domains, emails } = signupAllowlist();
  if (!domains.length && !emails.length) {
    throw httpError(503, 'Registration is not configured. Contact the site administrator.', 'AUTH_NOT_CONFIGURED');
  }
  return domains.includes(email.split('@')[1]) || emails.includes(email);
}
export function signupConfiguration() {
  const { domains, emails } = signupAllowlist();
  const domainConfigured = domains.length > 0 || emails.length > 0;
  const mailConfigured = Boolean(process.env.RESEND_API_KEY && process.env.AUTH_FROM_EMAIL);
  let urlConfigured = false;
  try { verificationBase(); urlConfigured = true; } catch { /* URL not ready */ }
  const enabled = domainConfigured && mailConfigured && urlConfigured;
  return { enabled, message: enabled ? null : 'Account registration is not available yet. Please contact the site administrator to complete the signup and email verification setup.' };
}
function requireSignupConfigured() {
  if (!signupConfiguration().enabled) {
    throw httpError(503, 'Account registration is not available yet. Ask the site administrator to configure approved emails and verification email delivery.', 'AUTH_NOT_CONFIGURED');
  }
}
function validateSignup(body) {
  const name = typeof body?.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
  const email = validEmail(body?.email);
  const employeeId = typeof body?.employee_id === 'string' ? body.employee_id.trim() : '';
  if (name.length < 2 || name.length > 100) throw httpError(422, 'Name must be 2 to 100 characters', 'VALIDATION_ERROR');
  if (!email || !allowedEmail(email)) throw httpError(422, 'Use an authorized company email address', 'VALIDATION_ERROR');
  if (employeeId.length > 60) throw httpError(422, 'Employee ID is too long', 'VALIDATION_ERROR');
  if (!/^\d{8}$/.test(body?.password ?? '')) throw httpError(422, 'Password must contain exactly 8 digits', 'VALIDATION_ERROR');
  return { name, email, employeeId: employeeId || null, password: body.password };
}

async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const digest = await scrypt(password, Buffer.from(salt, 'hex'), 64);
  return `scrypt:v1:${salt}:${digest.toString('hex')}`;
}
async function matchesPassword(password, saved) {
  const bits = typeof saved === 'string' ? saved.split(':') : [];
  if (bits.length !== 4 || bits[0] !== 'scrypt' || bits[1] !== 'v1') return false;
  const salt = Buffer.from(bits[2], 'hex');
  const expected = Buffer.from(bits[3], 'hex');
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(actual, expected);
}

async function checkRate(bucket, limit, windowMs) {
  const db = getDb();
  const t = Date.now();
  await db.execute({
    sql: `INSERT INTO auth_rate_limits(bucket,window_started_ms,attempts) VALUES(?,?,1)
      ON CONFLICT(bucket) DO UPDATE SET
      attempts = CASE WHEN window_started_ms < ? THEN 1 ELSE attempts+1 END,
      window_started_ms = CASE WHEN window_started_ms < ? THEN excluded.window_started_ms ELSE window_started_ms END`,
    args: [bucket, t, t - windowMs, t - windowMs],
  });
  const row = (await db.execute({ sql: 'SELECT attempts FROM auth_rate_limits WHERE bucket = ?', args: [bucket] })).rows[0];
  if (Number(row.attempts) > limit) throw httpError(429, 'Too many requests. Please try again later.', 'RATE_LIMITED');
}

async function throttle(kind, email, ip, limit, period) {
  // Both identity and IP limits: a single distributed attack cannot bypass the email bucket.
  await checkRate(`${kind}:email:${hashToken(email)}`, limit, period);
  await checkRate(`${kind}:ip:${hashToken(ip || 'unknown')}`, limit * 5, period);
}
function verificationBase() {
  const raw = process.env.APP_BASE_URL || '';
  let url;
  try { url = new URL(raw); } catch { throw httpError(503, 'APP_BASE_URL is not configured', 'AUTH_NOT_CONFIGURED'); }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw httpError(503, 'APP_BASE_URL must use HTTPS', 'AUTH_NOT_CONFIGURED');
  }
  return url.origin;
}
async function sendVerification(email, token) {
  const key = process.env.RESEND_API_KEY;
  const sender = process.env.AUTH_FROM_EMAIL;
  if (!key || !sender) throw httpError(503, 'Verification email service is not configured', 'EMAIL_NOT_CONFIGURED');
  const url = `${verificationBase()}/verify-email?token=${encodeURIComponent(token)}`;
  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'invoice-delivery-tracker/1.0' },
      body: JSON.stringify({
        from: sender, to: [email], subject: 'Verify your Invoice Tracker account',
        text: `Confirm your company email by opening this link:\n\n${url}\n\nThis link expires in 24 hours. If you did not create an account, ignore this message.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:540px;margin:auto;padding:28px;color:#202020"><h2>Verify your company email</h2><p>Confirm your email to activate your Invoice Tracker account.</p><p><a href="${url}" style="display:inline-block;background:#252422;color:white;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Verify email</a></p><p style="font-size:13px;color:#666">This link expires in 24 hours. If you did not sign up, you can ignore this message.</p></div>`,
      }),
    });
  } catch { throw httpError(503, 'Unable to send verification email', 'EMAIL_UNAVAILABLE'); }
  if (!response.ok) {
    console.error('Verification email provider rejected request:', response.status);
    throw httpError(503, 'Unable to send verification email', 'EMAIL_UNAVAILABLE');
  }
}
async function issueVerification(userId, email) {
  requireSignupConfigured();
  const token = newToken();
  const db = getDb();
  await db.execute({
    sql: 'INSERT INTO email_verification_tokens(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)',
    args: [hashToken(token), userId, new Date(Date.now() + EMAIL_HOURS * 3600000).toISOString(), now()],
  });
  await sendVerification(email, token);
}

export async function signup(body, ip) {
  const values = validateSignup(body);
  // Fail before creating a user row if email verification cannot be delivered.
  requireSignupConfigured();
  await throttle('signup', values.email, ip, 5, 60 * 60 * 1000);
  const db = getDb();
  const current = (await db.execute({ sql: 'SELECT id,verified_at FROM users WHERE email = ?', args: [values.email] })).rows[0];
  if (!current) {
    const id = randomUUID();
    const stamp = now();
    try {
      await db.execute({
        sql: 'INSERT INTO users(id,name,email,employee_id,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
        args: [id, values.name, values.email, values.employeeId, await passwordHash(values.password), stamp, stamp],
      });
      await issueVerification(id, values.email);
    } catch (error) {
      if (/UNIQUE/i.test(String(error.message))) return { message: 'If this address is eligible, a verification email will be sent.' };
      throw error;
    }
  } else if (!current.verified_at) {
    await issueVerification(current.id, values.email);
  }
  return { message: 'If this address is eligible, a verification email will be sent.' };
}

export async function resendVerification(body, ip) {
  requireSignupConfigured();
  const email = validEmail(body?.email);
  if (!email) throw httpError(422, 'Enter a valid email address', 'VALIDATION_ERROR');
  await throttle('resend', email, ip, 3, 60 * 60 * 1000);
  const user = (await getDb().execute({ sql: 'SELECT id,verified_at FROM users WHERE email = ?', args: [email] })).rows[0];
  if (user && !user.verified_at) await issueVerification(user.id, email);
  return { message: 'If this address is awaiting verification, another email will be sent.' };
}

export async function verifyEmail(raw) {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{40,100}$/.test(raw)) throw httpError(400, 'Invalid or expired verification link', 'INVALID_TOKEN');
  const db = getDb();
  const stamp = now();
  const tokenHash = hashToken(raw);
  const result = await db.batch([
    { sql: 'UPDATE users SET verified_at = COALESCE(verified_at, ?), updated_at = ? WHERE id IN (SELECT user_id FROM email_verification_tokens WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?)', args: [stamp, stamp, tokenHash, stamp] },
    { sql: 'UPDATE email_verification_tokens SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?', args: [stamp, tokenHash, stamp] },
  ], 'write');
  if (result[1].rowsAffected !== 1) throw httpError(400, 'Invalid or expired verification link', 'INVALID_TOKEN');
  return { message: 'Email verified. You can now sign in.' };
}

export async function signin(body, ip) {
  const email = validEmail(body?.email);
  const password = body?.password;
  if (!email || typeof password !== 'string' || !/^\d{8}$/.test(password)) throw httpError(401, BAD_LOGIN, 'INVALID_CREDENTIALS');
  await throttle('signin', email, ip, 8, 15 * 60 * 1000);
  const db = getDb();
  const user = (await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] })).rows[0];
  if (!user || !(await matchesPassword(password, user.password_hash))) throw httpError(401, BAD_LOGIN, 'INVALID_CREDENTIALS');
  if (!user.verified_at) throw httpError(403, 'Verify your company email before signing in', 'EMAIL_NOT_VERIFIED');
  const token = newToken();
  const expiry = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await db.execute({
    sql: 'INSERT INTO user_sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)',
    args: [hashToken(token), user.id, expiry, now()],
  });
  return { user: publicUser(user), token };
}

export function sessionCookie(token, secure = true) {
  return `${cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`;
}
export function clearSessionCookie(secure = true) {
  return `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
}
export function sessionToken(headers = {}) {
  const cookies = String(headers.cookie || '').split(';').map((s) => s.trim());
  const found = cookies.find((s) => s.startsWith(`${cookieName}=`));
  return found?.slice(cookieName.length + 1) || null;
}
export async function sessionUser(headers) {
  const token = sessionToken(headers);
  if (!token || !/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;
  const user = (await getDb().execute({
    sql: `SELECT u.* FROM user_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.verified_at IS NOT NULL`,
    args: [hashToken(token), now()],
  })).rows[0];
  return user ? publicUser(user) : null;
}
export async function logout(headers) {
  const token = sessionToken(headers);
  if (token) await getDb().execute({ sql: 'DELETE FROM user_sessions WHERE token_hash = ?', args: [hashToken(token)] });
  return { message: 'Signed out' };
}
