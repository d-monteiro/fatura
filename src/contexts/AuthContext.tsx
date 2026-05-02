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
    // Em PKCE, /auth/callback?code=... só vira sessão depois do exchange feito
    // pelo cliente. Marcar loading=false antes desse exchange dispara um
    // Navigate to="/login" prematuro no AuthCallback. INITIAL_SESSION (v2)
    // dispara uma vez após o cliente processar a URL — só aí libertamos o gate.
    // NEVER await supabase calls inside this callback (deadlock auth lock).
    let initialResolved = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        const nextUserId = s?.user?.id ?? null;
        setUser(prev => (prev?.id === nextUserId ? prev : s?.user ?? null));
        setSession(prev => (prev?.user?.id === nextUserId ? prev : s));
        if (!initialResolved && event === 'INITIAL_SESSION') {
          initialResolved = true;
          setLoading(false);
        }
      },
    );

    // Safety net: se INITIAL_SESSION não chegar (servidor lento, cliente
    // antigo), libertamos o gate na mesma para não ficar preso em spinner.
    const timer = setTimeout(() => {
      if (!initialResolved) {
        initialResolved = true;
        setLoading(false);
      }
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
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

export function useAuthOptional() {
  return useContext(AuthContext) ?? null;
}
