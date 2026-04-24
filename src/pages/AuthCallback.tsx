import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Janela para considerar um user como "recém-criado" (last_sign_in_at ≈ created_at).
// Cobre o round-trip normal do OAuth sem apanhar quem volta minutos depois.
const NEW_USER_WINDOW_MS = 15_000;

function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center">
      <LoadingSpinner size={40} />
    </div>
  );
}

export default function AuthCallback() {
  const { user, loading: authLoading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const intent = params.get('intent');

  const { data: membership, isLoading: membershipLoading } = useQuery({
    queryKey: ['auth-callback-membership', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', user!.id)
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });

  if (authLoading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (membershipLoading) return <Spinner />;
  if (membership) return <Navigate to="/" replace />;

  const createdMs = user.created_at ? new Date(user.created_at).getTime() : 0;
  const lastSignInMs = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0;
  const isNewUser = createdMs > 0 && Math.abs(lastSignInMs - createdMs) < NEW_USER_WINDOW_MS;

  // Só bloqueamos quando a intenção era EXPLICITAMENTE "login" e a conta é
  // fresca; qualquer outro caso (signup, user antigo, intent ausente) segue
  // direto para o onboarding.
  if (intent !== 'login' || !isNewUser) {
    return <Navigate to="/onboarding" replace />;
  }

  const handleCreate = () => navigate('/onboarding', { replace: true });
  const handleCancel = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Não encontrámos uma conta</AlertDialogTitle>
            <AlertDialogDescription>
              O email <strong>{user.email}</strong> ainda não está associado a nenhuma conta
              FaturaAI. Queres criar uma agora?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { void handleCancel(); }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleCreate}>
              Criar conta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
