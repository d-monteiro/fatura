import type { ComponentType } from 'react';
import { GoogleIcon, MicrosoftIcon } from './OAuthProviderIcons';

export type OAuthProviderId = 'google' | 'azure';

export interface OAuthProviderConfig {
  id: OAuthProviderId;
  label: string;
  icon: ComponentType;
  enabled: boolean;
}

export const OAUTH_PROVIDERS: OAuthProviderConfig[] = [
  { id: 'google', label: 'Google', icon: GoogleIcon, enabled: true },
  { id: 'azure', label: 'Microsoft', icon: MicrosoftIcon, enabled: false },
];
