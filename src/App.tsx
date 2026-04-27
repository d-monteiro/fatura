import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { reportError } from '@/lib/errors/errorReporter';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { TenantProvider } from '@/contexts/TenantContext';
import { I18nProvider } from '@/contexts/I18nContext';
import { UploadQueueProvider } from '@/contexts/UploadQueueContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { RequireTenant } from '@/components/common/RequireTenant';
import Dashboard from '@/pages/Dashboard';
import Faturas from '@/pages/Faturas';
import Duplicates from '@/pages/Duplicates';
import Upload from '@/pages/Upload';
import Fornecedores from '@/pages/Fornecedores';
import Login from '@/pages/Login';
import Settings from '@/pages/Settings';
import Onboarding from '@/pages/Onboarding';
import OnboardingThanks from '@/pages/OnboardingThanks';
import Landing from '@/pages/Landing';
import Billing from '@/pages/Billing';
import AccountSuspended from '@/pages/AccountSuspended';
import Tickets from '@/pages/Tickets';
import Privacy from '@/pages/Privacy';
import Terms from '@/pages/Terms';
import InviteAccept from '@/pages/InviteAccept';
import { FeedbackWidget } from '@/components/tickets/FeedbackWidget';
import { ErrorBoundary } from '@/lib/errors/errorBoundary';
import AdminLayout from '@/pages/admin/AdminLayout';
import AdminTenants from '@/pages/admin/AdminTenants';
import AdminTickets from '@/pages/admin/AdminTickets';
import AdminErrors from '@/pages/admin/AdminErrors';
import AdminUsage from '@/pages/admin/AdminUsage';
import AdminOnboarding from '@/pages/admin/AdminOnboarding';
import AdminAdmins from '@/pages/admin/AdminAdmins';
import AdminAnalytics from '@/pages/admin/AdminAnalytics';
import AuthCallback from '@/pages/AuthCallback';
import NotFound from '@/pages/NotFound';
import { usePageViews } from '@/lib/analytics/usePageViews';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      // AbortError é cancelamento (unmount, queryKey change), não falha
      if (error instanceof Error && error.name === 'AbortError') return;
      void reportError(error, {
        component: 'react-query/query',
        extra: { queryKey: query.queryKey },
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (error instanceof Error && error.name === 'AbortError') return;
      void reportError(error, {
        component: 'react-query/mutation',
        extra: { mutationKey: mutation.options.mutationKey },
      });
    },
  }),
});

function AppRoutes() {
  const { user, loading } = useAuth();
  usePageViews();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner size={40} />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route index element={<Landing />} />
        <Route path="login" element={<Login />} />
        <Route path="onboarding" element={<Onboarding />} />
        <Route path="auth/callback" element={<AuthCallback />} />
        <Route path="invite/:token" element={<InviteAccept />} />
        <Route path="legal/privacy" element={<Privacy />} />
        <Route path="legal/terms" element={<Terms />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="onboarding" element={<Onboarding />} />
      <Route path="onboarding/thanks" element={<OnboardingThanks />} />
      <Route path="auth/callback" element={<AuthCallback />} />
      <Route path="invite/:token" element={<InviteAccept />} />
      <Route path="account/suspended" element={<AccountSuspended />} />
      <Route path="legal/privacy" element={<Privacy />} />
      <Route path="legal/terms" element={<Terms />} />
      <Route path="admin" element={<AdminLayout />}>
        <Route index element={<AdminTenants />} />
        <Route path="tickets" element={<AdminTickets />} />
        <Route path="errors" element={<AdminErrors />} />
        <Route path="usage" element={<AdminUsage />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="onboarding" element={<AdminOnboarding />} />
        <Route path="admins" element={<AdminAdmins />} />
      </Route>
      <Route element={<RequireTenant><UploadQueueProvider><AppLayout /></UploadQueueProvider></RequireTenant>}>
        <Route index element={<Dashboard />} />
        <Route path="invoices" element={<Faturas />} />
        <Route path="invoices/duplicates" element={<Duplicates />} />
        <Route path="upload" element={<Upload />} />
        <Route path="suppliers" element={<Fornecedores />} />
        <Route path="billing" element={<Billing />} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TenantProvider>
            <ErrorBoundary>
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
              <ErrorBoundary fallback={null}>
                <FeedbackWidget />
              </ErrorBoundary>
            </ErrorBoundary>
            <Toaster richColors position="top-right" />
          </TenantProvider>
        </AuthProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}
