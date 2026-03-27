import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-60 min-h-screen p-6">
        <Outlet />
      </main>
    </div>
  );
}
