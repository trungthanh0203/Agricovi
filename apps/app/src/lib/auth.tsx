import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  /** true cho tới khi biết chắc có hay không có phiên đăng nhập (phiên được giữ trên thiết bị, dùng được khi offline) */
  loading: boolean;
  /** true khi người dùng vừa bấm liên kết "đặt lại mật khẩu" trong email */
  recovering: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** trả về true nếu cần xác nhận email trước khi đăng nhập */
  signUp: (email: string, password: string) => Promise<boolean>;
  sendReset: (email: string) => Promise<void>;
  setNewPassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

function requireClient() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  return supabase;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    // getSession đọc phiên đã lưu cục bộ nên không cần mạng
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') setRecovering(false);
      setLoading(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Nhận email hoặc số điện thoại. Số điện thoại được đổi thành email ẩn theo cấu hình tên miền trong CSDL.
  const signIn = useCallback(async (identifier: string, password: string) => {
    const client = requireClient();
    let email = identifier.trim();
    if (!email.includes('@')) {
      const { data, error } = await client.rpc('login_email_for_phone', { p_phone: email });
      if (error) throw error;
      if (!data) throw new Error('INVALID_PHONE: Số điện thoại chưa đúng. Hãy nhập số di động 10 chữ số, ví dụ 0912345678.');
      email = data as string;
    }
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await requireClient().auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
    return data.session === null; // chưa có phiên => đang chờ xác nhận email
  }, []);

  const sendReset = useCallback(async (email: string) => {
    const { error } = await requireClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    if (error) throw error;
  }, []);

  const setNewPassword = useCallback(async (password: string) => {
    const { error } = await requireClient().auth.updateUser({ password });
    if (error) throw error;
    setRecovering(false);
  }, []);

  const signOut = useCallback(async () => {
    await requireClient().auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ session, loading, recovering, signIn, signUp, sendReset, setNewPassword, signOut }),
    [session, loading, recovering, signIn, signUp, sendReset, setNewPassword, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth phải nằm trong AuthProvider');
  return v;
}
