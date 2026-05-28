import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

const TOKEN_KEY = 'bs_token';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || null);
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  // Валідація збереженого токена при старті.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token) {
        setBooting(false);
        return;
      }
      try {
        const { user: u } = await api.me(token);
        if (alive) setUser(u);
      } catch {
        if (alive) {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
        }
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback((tok, usr) => {
    localStorage.setItem(TOKEN_KEY, tok);
    setToken(tok);
    setUser(usr);
  }, []);

  const login = useCallback(
    async (username, password) => {
      const { token: tok, user: usr } = await api.login(username, password);
      persist(tok, usr);
    },
    [persist],
  );

  const register = useCallback(
    async (username, password) => {
      await api.register(username, password);
      // Автоматичний вхід одразу після реєстрації.
      const { token: tok, user: usr } = await api.login(username, password);
      persist(tok, usr);
    },
    [persist],
  );

  const guest = useCallback(async () => {
    const { token: tok, user: usr } = await api.guest();
    persist(tok, usr);
  }, [persist]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // Оновити профіль (нову статистику) після онлайн-матчу.
  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const { user: u } = await api.me(token);
      setUser(u);
    } catch {
      /* ігноруємо — не критично */
    }
  }, [token]);

  return (
    <AuthContext.Provider
      value={{ token, user, booting, login, register, guest, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
