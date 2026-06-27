import { useState, useEffect, useCallback } from 'react';
import {
  getAdminToken,
  adminLogin,
  adminLogout,
  checkAdminSession,
  getAdminActor,
  type AdminActor,
} from '../lib/adminSession';

const ADMIN_UI_KEY = 'alpicois_admin_mode';

export function useAdminMode() {
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem(ADMIN_UI_KEY) === 'true');
  const [adminActor, setAdminActor] = useState<AdminActor | null>(() => getAdminActor());
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem(ADMIN_UI_KEY, isAdmin ? 'true' : 'false');
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!getAdminToken()) {
      setIsAdmin(false);
      setAdminActor(null);
      return;
    }
    checkAdminSession().then(({ ok, actor }) => {
      if (!ok) {
        setIsAdmin(false);
        setAdminActor(null);
      } else if (actor) {
        setAdminActor(actor);
      }
    });
  }, [isAdmin]);

  const enableAdmin = useCallback(() => {
    setLoginError(null);
    setLoginOpen(true);
  }, []);

  const disableAdmin = useCallback(() => {
    adminLogout();
    setIsAdmin(false);
    setAdminActor(null);
    setLoginOpen(false);
  }, []);

  const toggleAdmin = useCallback(() => {
    if (isAdmin) disableAdmin();
    else enableAdmin();
  }, [isAdmin, disableAdmin, enableAdmin]);

  const submitLogin = useCallback(async (password: string, actor: AdminActor) => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      const resolved = await adminLogin(password, actor);
      setAdminActor(resolved);
      setIsAdmin(true);
      setLoginOpen(false);
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'Erreur de connexion');
    } finally {
      setLoginLoading(false);
    }
  }, []);

  const cancelLogin = useCallback(() => {
    setLoginOpen(false);
    setLoginError(null);
  }, []);

  return {
    isAdmin,
    adminActor,
    toggleAdmin,
    loginOpen,
    loginError,
    loginLoading,
    submitLogin,
    cancelLogin,
  };
}
