import { LayoutDashboard, FileText, Inbox } from 'lucide-react';

interface Props {
  logo: string | null;
  primary: string;
  secondary: string;
  name: string;
}

export function BrandPreview({ logo, primary, secondary, name }: Props) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '·';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium">Pré-visualização</span>
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      </div>
      <div
        className="rounded-xl border overflow-hidden shadow-sm"
        style={{ background: `linear-gradient(135deg, ${primary}08, ${secondary}14)` }}
      >
        <div
          className="flex items-center gap-2 px-3 py-2.5 text-white text-xs font-medium"
          style={{ background: `linear-gradient(90deg, ${primary}, ${secondary})` }}
        >
          <div className="h-7 w-7 rounded-md bg-white/95 border border-white/40 flex items-center justify-center overflow-hidden shrink-0">
            {logo ? (
              <img src={logo} alt="" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-[10px] font-bold" style={{ color: primary }}>{initials}</span>
            )}
          </div>
          <span className="truncate">{name}</span>
        </div>
        <div className="p-3 space-y-1.5 bg-background/80">
          <PreviewItem icon={<LayoutDashboard className="h-3.5 w-3.5" />} label="Dashboard" active color={primary} />
          <PreviewItem icon={<FileText className="h-3.5 w-3.5" />} label="Faturas" />
          <PreviewItem icon={<Inbox className="h-3.5 w-3.5" />} label="Inbox" />
          <div className="pt-2 mt-2 border-t flex items-center gap-2">
            <div
              className="h-6 w-6 rounded-full border-2 border-white shadow flex items-center justify-center overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
            >
              {logo ? (
                <img src={logo} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-[9px] font-bold text-white">{initials}</span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground">O seu avatar</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewItem({
  icon,
  label,
  active,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  color?: string;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
      style={active && color ? { background: `${color}18`, color } : undefined}
    >
      <span className={active ? '' : 'text-muted-foreground'}>{icon}</span>
      <span className={active ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
    </div>
  );
}
