import { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileHeader } from '@/components/layout/MobileHeader';
import { ReauthBanner } from '@/components/common/ReauthBanner';

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleMobile = useCallback(() => setMobileOpen((o) => !o), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader onMenuToggle={toggleMobile} />
      <Sidebar mobileOpen={mobileOpen} onMobileClose={closeMobile} />
      <main className="min-h-screen p-4 pt-[72px] sm:p-6 sm:pt-[72px] md:ml-60 md:pt-6">
        <div className="mb-4 empty:mb-0">
          <ReauthBanner />
        </div>
        <Outlet />
      </main>
    </div>
  );
}
