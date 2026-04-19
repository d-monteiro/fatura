import { useState } from 'react';
import { BarChart3, Filter, LineChart, Route, Globe2 } from 'lucide-react';
import { PeriodFilter, type Period } from '@/components/admin/analytics/PeriodFilter';
import { AnalyticsOverview } from '@/components/admin/analytics/AnalyticsOverview';
import { OnboardingFunnel } from '@/components/admin/analytics/OnboardingFunnel';
import { TopEvents } from '@/components/admin/analytics/TopEvents';
import { UserJourneys } from '@/components/admin/analytics/UserJourneys';
import { LandingMetrics } from '@/components/admin/analytics/LandingMetrics';

type TabId = 'overview' | 'funnel' | 'events' | 'journeys' | 'landing';

const TABS: { id: TabId; label: string; icon: typeof BarChart3 }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'funnel', label: 'Funil Onboarding', icon: Filter },
  { id: 'events', label: 'Top eventos', icon: LineChart },
  { id: 'journeys', label: 'User journeys', icon: Route },
  { id: 'landing', label: 'Landing', icon: Globe2 },
];

export default function AdminAnalytics() {
  const [tab, setTab] = useState<TabId>('overview');
  const [period, setPeriod] = useState<Period>('30d');

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Cliques, fluxos, funis — dados via PostHog (EU).
          </p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <div className="border-b">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={
                  active
                    ? 'flex items-center gap-2 border-b-2 border-primary px-4 py-2 text-sm font-medium text-primary'
                    : 'flex items-center gap-2 border-b-2 border-transparent px-4 py-2 text-sm text-muted-foreground hover:text-foreground'
                }
              >
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-2">
        {tab === 'overview' && <AnalyticsOverview period={period} />}
        {tab === 'funnel' && <OnboardingFunnel period={period} />}
        {tab === 'events' && <TopEvents period={period} />}
        {tab === 'journeys' && <UserJourneys period={period} />}
        {tab === 'landing' && <LandingMetrics period={period} />}
      </div>
    </div>
  );
}
