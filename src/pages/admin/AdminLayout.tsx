import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Building2, LifeBuoy, AlertTriangle, BarChart3, FileText, ShieldAlert, Users, LogOut, LineChart, Briefcase } from 'lucide-react';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Button } from '@/components/ui/button';

const NAV_ITEMS = [
  { path: '/admin', label: 'Tenants', icon: Building2, end: true },
  { path: '/admin/tickets', label: 'Tickets', icon: LifeBuoy },
  { path: '/admin/errors', label: 'Erros', icon: AlertTriangle },
  { path: '/admin/usage', label: 'Utilização', icon: BarChart3 },
  { path: '/admin/analytics', label: 'Analytics', icon: LineChart },
  { path: '/admin/onboarding', label: 'Onboarding', icon: FileText },
  { path: '/admin/leads', label: 'Leads', icon: Briefcase },
  { path: '/admin/admins', label: 'Admins', icon: Users },
];

export default function AdminLayout() {
  const { isAdmin, loading } = useIsAdmin();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
            Esta área é reservada a administradores.
          </p>
          <Button onClick={() => navigate('/')}>Voltar à app</Button>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r bg-muted/30 p-4 flex flex-col">
        <div className="font-bold text-primary text-lg mb-4 px-1">Admin</div>
        <nav className="space-y-1 flex-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="pt-4 border-t mt-4 space-y-2">
          <div className="px-1 text-xs text-muted-foreground truncate" title={user?.email ?? ''}>
            {user?.email}
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={handleLogout}>
            <LogOut className="h-4 w-4" /> Terminar sessão
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
