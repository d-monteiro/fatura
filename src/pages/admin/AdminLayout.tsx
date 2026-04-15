import { Outlet, Link, useLocation } from 'react-router-dom';
import { Building2, LifeBuoy, AlertTriangle, BarChart3, FileText, ShieldAlert } from 'lucide-react';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

const NAV_ITEMS = [
  { path: '/admin', label: 'Tenants', icon: Building2 },
  { path: '/admin/tickets', label: 'Tickets', icon: LifeBuoy },
  { path: '/admin/errors', label: 'Erros', icon: AlertTriangle },
  { path: '/admin/usage', label: 'Uso', icon: BarChart3 },
  { path: '/admin/onboarding', label: 'Onboarding', icon: FileText },
];

export default function AdminLayout() {
  const location = useLocation();
  const { isAdmin, loading } = useIsAdmin();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner size={40} />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold">Acesso negado</h1>
          <p className="text-sm text-muted-foreground">
            Esta área é reservada a administradores. Se acreditas que devias ter acesso, contacta o suporte.
          </p>
          <Link
            to="/"
            className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Voltar à app
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r bg-muted/30 p-4 space-y-1">
        <div className="font-bold text-primary text-lg mb-4">Admin</div>
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        <div className="pt-4 border-t mt-4">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
            &larr; Voltar à app
          </Link>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
