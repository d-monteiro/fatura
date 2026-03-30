import {
  Clock,
  Mail,
  Zap,
  HardDrive,
  Database,
  CheckCircle2,
} from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

export function AutoSyncStatus() {
  const { t } = useI18n();

  return (
    <>
      {/* Sync status card */}
      <div className="border border-green-200 bg-green-50/50 rounded-xl p-6">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-green-800">
          <Clock size={20} />
          {t('auto.sync_title')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t('auto.sync_desc')}</p>
      </div>

      {/* How it works */}
      <div className="border border-border rounded-xl p-6">
        <h2 className="text-base font-semibold mb-4">{t('auto.how_it_works')}</h2>
        <div className="text-sm text-muted-foreground space-y-2">
          <StepLine icon={Mail} text={t('auto.step_scan')} />
          <StepLine icon={Zap} text={t('auto.step_ai')} />
          <StepLine icon={HardDrive} text={t('auto.step_drive')} />
          <StepLine icon={Database} text={t('auto.step_db')} />
          <StepLine icon={CheckCircle2} text={t('auto.step_dedup')} />
        </div>
        <hr className="my-4 border-border" />
        <p className="text-xs text-muted-foreground">{t('auto.errors_webhook')}</p>
      </div>
    </>
  );
}

function StepLine({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
