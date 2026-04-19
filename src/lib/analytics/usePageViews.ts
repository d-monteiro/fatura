import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { posthog, isReady } from './posthog';

export function usePageViews() {
  const location = useLocation();
  useEffect(() => {
    if (!isReady()) return;
    try {
      posthog.capture('$pageview', {
        $current_url: window.location.href,
        pathname: location.pathname,
        search: location.search,
      });
    } catch { /* ignore */ }
  }, [location.pathname, location.search]);
}
