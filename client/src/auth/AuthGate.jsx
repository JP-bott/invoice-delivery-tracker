import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, LockKeyhole, Mail, ReceiptText, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthContext.jsx';

function AuthFrame({ title, description, children }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-7 flex items-center justify-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-brand-fg"><ReceiptText size={23} aria-hidden="true" /></span>
          <div><p className="text-lg font-bold text-fg">Invoice Tracker</p><p className="text-xs text-fg-muted">Secure company workspace</p></div>
        </div>
        <div className="rounded-2xl border border-line bg-surface px-5 py-7 shadow-pop sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">{description}</p>
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-5 text-center text-xs text-fg-muted"><ShieldCheck size={14} className="mr-1 inline align-text-bottom" /> Company email verification required to access invoices.</p>
      </div>
    </main>
  );
}

const field = 'input mt-1 w-full';
const inputLabel = 'block text-sm font-medium text-fg';
const errorBox = 'rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger';
const infoBox = 'rounded-lg border border-line bg-surface-2 px-3 py-3 text-sm text-fg';

export function Login() {
  const { signin, resend } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(new URLSearchParams(location.search).has('verified') ? 'Email verified. Sign in to continue.' : '');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { await signin(email, password); navigate('/', { replace: true }); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const onResend = async () => {
    if (!email.trim()) { setError('Enter your company email first.'); return; }
    setError(''); setResending(true);
    try { const response = await resend(email); setNotice(response.message); }
    catch (e) { setError(e.message); }
    finally { setResending(false); }
  };
  return (
    <AuthFrame title="Sign in" description="Access your company invoice and delivery workspace.">
      <form onSubmit={submit} className="space-y-4">
        {notice && <p className={infoBox} role="status">{notice}</p>}
        {error && <p className={errorBox} role="alert">{error}</p>}
        <label className={inputLabel}>Company email
          <input className={field} type="email" name="email" autoComplete="username" maxLength={254} required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
        </label>
        <label className={inputLabel}>8-digit password
          <input className={field} type="password" name="password" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} minLength={8} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your 8-digit password" />
        </label>
        <button disabled={busy} type="submit" className="btn btn-primary w-full justify-center">{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={16} /></button>
      </form>
      <div className="mt-5 space-y-3 text-center text-sm">
        <p className="text-fg-muted">No account yet? <Link to="/signup" className="font-semibold text-brand-ink underline-offset-4 hover:underline">Create an account</Link></p>
        <button type="button" disabled={resending} onClick={onResend} className="text-xs text-fg-muted underline underline-offset-4 hover:text-fg">{resending ? 'Sending…' : 'Resend verification email'}</button>
      </div>
    </AuthFrame>
  );
}

export function Signup() {
  const { signup } = useAuth();
  const [values, setValues] = useState({ name: '', email: '', employee_id: '', password: '' });
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [availability, setAvailability] = useState(null);
  useEffect(() => {
    let active = true;
    fetch('/api/auth/signup-status', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Availability check failed');
        return response.json();
      })
      .then((status) => { if (active) setAvailability(status); })
      .catch(() => { if (active) setAvailability(null); });
    return () => { active = false; };
  }, []);
  const set = (key) => (e) => setValues((current) => ({ ...current, [key]: e.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (availability?.enabled === false) {
      setError(availability.message || 'Account registration is temporarily unavailable.');
      return;
    }
    if (values.password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try { const response = await signup(values); setNotice(response.message); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return (
    <AuthFrame title="Create an account" description="Register with your authorized company email. You must verify it before signing in.">
      {notice ? (
        <div className="text-center">
          <CheckCircle2 className="mx-auto mb-3 text-success" size={36} aria-hidden="true" />
          <p className={infoBox} role="status">{notice}</p>
          <p className="mt-3 text-sm text-fg-muted">Check your inbox and spam folder. Verification links expire after 24 hours.</p>
          <Link to="/login" className="btn btn-primary mt-5 w-full justify-center">Go to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {availability?.enabled === false && (
            <p className={infoBox} role="status">{availability.message}</p>
          )}
          {error && <p className={errorBox} role="alert">{error}</p>}
          <label className={inputLabel}>Full name
            <input className={field} name="name" autoComplete="name" minLength={2} maxLength={100} required value={values.name} onChange={set('name')} placeholder="Full name" />
          </label>
          <label className={inputLabel}>Company email
            <input className={field} type="email" name="email" autoComplete="email" maxLength={254} required value={values.email} onChange={set('email')} placeholder="name@company.com" />
          </label>
          <label className={inputLabel}>Employee ID <span className="font-normal text-fg-muted">(optional)</span>
            <input className={field} name="employee_id" maxLength={60} value={values.employee_id} onChange={set('employee_id')} placeholder="Employee ID" />
          </label>
          <label className={inputLabel}>Create 8-digit password
            <input className={field} type="password" name="new-password" autoComplete="new-password" inputMode="numeric" pattern="[0-9]{8}" minLength={8} maxLength={8} required value={values.password} onChange={set('password')} placeholder="8 digits only" />
          </label>
          <label className={inputLabel}>Confirm password
            <input className={field} type="password" name="confirm-password" autoComplete="new-password" inputMode="numeric" pattern="[0-9]{8}" minLength={8} maxLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat your password" />
          </label>
          <p className="text-xs leading-relaxed text-fg-muted"><LockKeyhole size={13} className="mr-1 inline" /> Your password is securely hashed before it is stored. Eight-digit passwords are less secure than longer passwords; do not reuse a PIN.</p>
          <button disabled={busy || availability?.enabled === false} type="submit" className="btn btn-primary w-full justify-center">{busy ? 'Registering…' : 'Sign up'}<Mail size={16} /></button>
        </form>
      )}
      <p className="mt-5 text-center text-sm text-fg-muted">Already registered? <Link to="/login" className="font-semibold text-brand-ink underline-offset-4 hover:underline">Sign in</Link></p>
    </AuthFrame>
  );
}

export function VerifyEmail() {
  const { verify } = useAuth();
  const location = useLocation();
  const [state, setState] = useState({ loading: true, error: '' });
  const token = new URLSearchParams(location.search).get('token');
  useEffect(() => {
    let active = true;
    if (!token) { setState({ loading: false, error: 'This verification link is invalid.' }); return undefined; }
    verify(token).then(() => {
      if (active) {
        // Redirect to the sign-in page after verification; never auto-sign-in.
        window.history.replaceState(null, '', '/login?verified=1');
        window.location.replace('/login?verified=1');
      }
    }).catch((error) => { if (active) setState({ loading: false, error: error.message }); });
    return () => { active = false; };
  }, [token, verify]);
  return (
    <AuthFrame title="Verify company email" description="Confirming that your email address belongs to you.">
      {state.loading ? <p className={infoBox} role="status">Verifying your email…</p> : <p className={errorBox} role="alert">{state.error}</p>}
      <Link to="/login" className="btn btn-secondary mt-5 w-full justify-center">Return to sign in</Link>
    </AuthFrame>
  );
}

export default function AuthGate({ children }) {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  if (pathname === '/verify-email') return <VerifyEmail />;
  if (loading) return <main className="grid min-h-dvh place-items-center bg-canvas text-sm text-fg-muted" role="status">Loading your account…</main>;
  if (!user) return pathname === '/signup' ? <Signup /> : <Login />;
  if (pathname === '/login' || pathname === '/signup') return <Navigate to="/" replace />;
  return children;
}
