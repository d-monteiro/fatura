import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { identify, resetTracking } from '@/lib/analytics/track';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    // NEVER await supabase calls inside this callback (deadlock).
    // TOKEN_REFRESHED dispara ao voltar à tab; se o user é o mesmo, não
    // propagar novas referências para evitar remount em cascata (RequireTenant).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        const nextUserId = s?.user?.id ?? null;
        setUser(prev => (prev?.id === nextUserId ? prev : s?.user ?? null));
        setSession(prev => (prev?.user?.id === nextUserId ? prev : s));
        setLoading(false);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      identify(user.id, {
        email: user.email ?? undefined,
        created_at: user.created_at,
      });
    } else {
      resetTracking();
    }
  }, [user]);

  async function login(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
