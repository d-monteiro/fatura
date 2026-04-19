export interface ErrorContext {
  tenantId?: string;
  userId?: string;
  level?: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  component?: string;
  function?: string;
  extra?: Record<string, unknown>;
  skipSlack?: boolean;
}
