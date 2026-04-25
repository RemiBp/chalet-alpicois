import { useState, useEffect, useCallback } from 'react';

const ADMIN_KEY = 'alpicois_admin_mode';

export function useAdminMode() {
  const [isAdmin, setIsAdmin] = useState(() => {
    return localStorage.getItem(ADMIN_KEY) === 'true';
  });

  useEffect(() => {
    localStorage.setItem(ADMIN_KEY, isAdmin ? 'true' : 'false');
  }, [isAdmin]);

  const toggleAdmin = useCallback(() => {
    setIsAdmin(prev => !prev);
  }, []);

  return { isAdmin, toggleAdmin };
}
