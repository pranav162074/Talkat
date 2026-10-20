import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { TOKEN_KEY } from '../api/axios';
import { disablePush } from '../utils/push';
import { AuthContext } from './authContext';

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  // Only "loading" if there is a saved token that we still have to check
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));

  // On first load, check the saved token with the backend
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;

    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        // The session is over, so this browser must stop getting the old account's messages
        disablePush().catch(() => {});
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback((newToken, newUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  // Logging out turns notifications off on this device, so on a shared computer the next
  // person never sees your messages. Done before the token is removed, while it still works.
  const logout = useCallback(async () => {
    await disablePush().catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // Used by the profile page: replaces the user with the updated one from the server
  const updateUser = useCallback((updated) => setUser(updated), []);

  const value = useMemo(
    () => ({ user, token, loading, login, logout, updateUser }),
    [user, token, loading, login, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}