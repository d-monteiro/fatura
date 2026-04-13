import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Building2, LifeBuoy, AlertTriangle, BarChart3, FileText } from 'lucide-react';

const ADMIN_EMAILS = ['admin@faturai.com']; // TODO: Replace with user_roles_global table

const NAV_ITEMS = [
  { path: '/admin', label: 'Tenants', icon: Building2 },
  { path: '/admin/tickets', label: 'Tickets', icon: LifeBuoy },
  { path: '/admin/errors', label: 'Erreurs', icon: AlertTriangle },
  { path: '/admin/usage', label: 'Usage', icon: BarChart3 },
  { path: '/admin/onboarding', label: 'Onboarding', icon: FileText },
];

export default function AdminLayout() {
  const { user } = useAuth();
  const location = useLocation();

  // Guard: only allow admin users
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r bg-muted/30 p-4 space-y-1">
        <div className="font-bold text-primary text-lg mb-4">Admin Panel</div>
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
            &larr; Retour à l'app
          </Link>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
