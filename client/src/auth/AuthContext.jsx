import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);

async function request(path, options) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error?.message || 'Request failed'), { status: response.status, code: data.error?.code });
  }
  return data;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await request('/api/auth/me');
      setUser(response.user);
    } catch { setUser(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('idt:auth-required', onExpired);
    return () => window.removeEventListener('idt:auth-required', onExpired);
  }, []);

  const signin = useCallback(async (email, password) => {
    const result = await request('/api/auth/signin', { method: 'POST', body: JSON.stringify({ email, password }) });
    setUser(result.user);
    return result.user;
  }, []);
  const signup = useCallback((values) => request('/api/auth/signup', { method: 'POST', body: JSON.stringify(values) }), []);
  const resend = useCallback((email) => request('/api/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }), []);
  const verify = useCallback((token) => request('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }), []);
  const logout = useCallback(async () => {
    try { await request('/api/auth/logout', { method: 'POST', body: '{}' }); }
    finally { setUser(null); }
  }, []);

  const value = useMemo(() => ({ user, loading, signin, signup, resend, verify, logout, refresh }), [user, loading, signin, signup, resend, verify, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
