import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PostHogProvider } from '@posthog/react';
import App from '@/App';
import { installGlobalErrorHandlers } from '@/lib/errors/errorReporter';
import { POSTHOG_KEY, POSTHOG_OPTIONS } from '@/lib/analytics/posthog';
import '@/index.css';

installGlobalErrorHandlers();

const root = createRoot(document.getElementById('root')!);
if (POSTHOG_KEY) {
  root.render(
    <StrictMode>
      <PostHogProvider apiKey={POSTHOG_KEY} options={POSTHOG_OPTIONS}>
        <App />
      </PostHogProvider>
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
