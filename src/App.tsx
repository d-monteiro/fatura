import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { TenantProvider } from '@/contexts/TenantContext';
import { I18nProvider } from '@/contexts/I18nContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import Dashboard from '@/pages/Dashboard';
import Inbox from '@/pages/Inbox';
import Faturas from '@/pages/Faturas';
import Upload from '@/pages/Upload';
import Fournisseurs from '@/pages/Fournisseurs';
import Login from '@/pages/Login';
import Settings from '@/pages/Settings';
import Automations from '@/pages/Automations';
import Onboarding from '@/pages/Onboarding';
import Landing from '@/pages/Landing';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

function AppRoutes() {
  const { user, loading } = useAuth();

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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="onboarding" element={<Onboarding />} />
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="invoices" element={<Faturas />} />
        <Route path="upload" element={<Upload />} />
        <Route path="suppliers" element={<Fournisseurs />} />
        <Route path="automations" element={<Automations />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TenantProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
            <Toaster richColors position="top-right" />
          </TenantProvider>
        </AuthProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}
