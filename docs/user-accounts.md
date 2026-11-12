# Company account sign-in and email verification

This feature adds individual user accounts to the existing **shared company Invoice & Delivery Tracker**. It **does not partition invoice, client, product, dashboard, or settings records by user**. Every verified employee with an allowed company email can access the current shared company workspace. If you need user-private records or role permissions, implement database ownership/authorization checks throughout the business services before deploying to separate customers.

## Data and compatibility

- The additive Turso migration is `migrations/012_user_authentication.sql`. The application also creates the new tables via `ensureSchema()` on the first API request after deployment.
- New `users` columns: random UUID `id`, `name`, case-insensitive unique `email`, nullable `employee_id`, `password_hash`, `verified_at`, creation/update timestamps.
- Passwords are salted and hashed using Node's scrypt. Plaintext passwords are never stored. The requested eight-digit numeric PIN is accepted, but is weaker than a conventional long password. Login is rate limited per email and IP.
- `email_verification_tokens` holds SHA-256 token digests, 24-hour expiry, and consumption time. Links are single-use.
- `user_sessions` holds SHA-256 digests of cryptographically random session tokens. Browsers receive a HttpOnly, SameSite=Lax, Secure-on-HTTPS cookie with seven-day expiry. Logout deletes the server session.
- `auth_rate_limits` implements persisted signup, resend and signin throttles.
- Existing business tables, rows, invoice numbering, and business logic are not modified.
- Serverless API requests are blocked without a verified session. Public routes are signup, sign in, verification, resend, and session status. Only verified sessions may access tracker business APIs.

## Required environment variables (server-side only)

Set these in the Vercel project and, for local development, in the root `.env` file:

| Variable | Example | Purpose |
| --- | --- | --- |
| `TURSO_DATABASE_URL` | `libsql://<database>.turso.io` | Existing Turso database |
| `TURSO_AUTH_TOKEN` | secret | Existing Turso API token |
| `AUTH_ALLOWED_DOMAINS` | `company.com` | Exact allowed company email domains, comma-separated. Optional if exact-address allowlist is used. | 
| `AUTH_ALLOWED_EMAILS` | `employee@gmail.com` | Optional individually approved email addresses, comma-separated. Do not authorize the whole Gmail domain. |
| `APP_BASE_URL` | `https://your-app.example.com` | Public URL used in the verification email |
| `RESEND_API_KEY` | secret | Resend transactional email API key |
| `AUTH_FROM_EMAIL` | `Invoice Tracker <verify@company.com>` | Sender identity verified in Resend |

Never prefix server secrets with `VITE_`. Neither Turso tokens nor Resend credentials belong in the React bundle.

## Production deployment checklist

1. Back up the current Turso database before the schema update.
2. Configure an email domain in Resend and validate the sender identity. Configure all required environment values on Vercel.
3. Deploy the branch to a preview environment **with the matching `APP_BASE_URL`** and test company signup, email delivery, token expiration, verification, signin, logout, and unverified access.
4. Verify that unauthenticated requests to `/api/invoices`, `/api/dashboard/summary`, and settings endpoints return 401; verified sessions should keep all existing invoice functionality.
5. Run `npm test` and `npm run build` in CI or locally. Existing invoice and dashboard test suites still exercise the same business services.
6. Only after validation, merge and deploy to production. The initial release will require every existing employee to create a verified account. Existing records remain intact in the shared workspace.

## User workflow

1. Click **Create an account** on the sign-in page.
2. Enter full name, authorized company email, optional employee ID, and a password of exactly eight digits.
3. Receive a transactional email with a **Verify email** button. The link expires after 24 hours.
4. Clicking it verifies the account and redirects to the sign-in page.
5. Sign in with company email and PIN to use the existing tracker. The top bar provides **Sign out**.
6. The privacy notice continues to appear every browser-tab session. Authentication cookies are essential; optional saved theme and layout preferences remain consent-controlled.

## Security notes

- Domain allowlisting only confirms mailbox domain ownership after email verification. It does not verify employment status or grant different roles.
- Eight-digit numeric PINs offer only 100 million possibilities. Stored hashes and rate limiting reduce risk but do not replace longer passwords, MFA, or company SSO for higher-risk deployments.
- Rate limiting uses fixed windows. Consider a shared edge WAF, CAPTCHA, improved progressive throttling, and audit logs before opening the service to a large audience.
- If a company email account is compromised, possession of its mailbox can activate a new account. Consider administrator approval for sensitive invoice data.
- This feature does not include password reset or account recovery. Add an authenticated, audited recovery flow before wide production use.
- The new login cookie is necessary for sign-in even when optional preference storage is declined.

## Local checks

```bash
npm install
npm test
npm run build
npm run dev
```

The API creates new auth tables automatically on the first request; you can also apply `migrations/012_user_authentication.sql` with a Turso-compatible SQL client if you prefer controlled migration management.

## Fix: signup returns 503 `AUTH_NOT_CONFIGURED`

The message `Company email signup is not configured` means production registration is missing an allowlist. It cannot be repaired by changing the browser, password, or Turso database.

1. Open the Vercel project for `invoice-delivery-tracker`, then **Settings → Environment Variables**.
2. Set **one or both** of `AUTH_ALLOWED_DOMAINS` (for example, `company.com`) and `AUTH_ALLOWED_EMAILS` (for example, `approved.person@gmail.com`). Do not add `gmail.com` as a permitted domain unless every Gmail address should legitimately receive company access.
3. Set `APP_BASE_URL=https://invoice-delivery-tracker.vercel.app` (or your actual canonical HTTPS domain).
4. Set `RESEND_API_KEY` to the transactional email API key and `AUTH_FROM_EMAIL` to a sender address from a verified sending domain. These are separate from the intended recipient address and must remain secret server environment variables.
5. Configure these for the **Production** environment (and **Preview** only if testing that deployment), then redeploy. Environment-variable changes are not automatically applied to already-built deployments.
6. Verify `GET /api/auth/signup-status` returns `{ "enabled": true, "message": null }` without exposing configured addresses or secrets. Create and verify a new test account.

If settings are missing, the signup page now displays a non-technical configuration warning and disables submission. The API does not create a pending user until the email service configuration is present. A verified sender domain and valid API key are required to actually deliver the email; configuration readiness cannot confirm the provider account is working.
