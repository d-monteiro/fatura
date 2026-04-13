import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { MessageCircleQuestion, X, Send } from 'lucide-react';

type FeedbackType = 'bug' | 'feature' | 'feedback';

export function FeedbackWidget() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<FeedbackType | null>(null);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!user || !tenant || !message.trim() || !type) return;
    setSending(true);
    try {
      await supabase.from('tickets').insert({
        tenant_id: tenant.id,
        user_id: user.id,
        subject: type === 'bug' ? 'Bug Report' : type === 'feature' ? 'Feature Request' : 'Feedback',
        description: message.trim(),
        category: type === 'bug' ? 'bug' : type === 'feature' ? 'feature' : 'general',
        priority: type === 'bug' ? 'high' : 'medium',
        page_url: window.location.href,
        browser_info: { userAgent: navigator.userAgent },
      });
      setSent(true);
      setTimeout(() => { setIsOpen(false); setSent(false); setType(null); setMessage(''); }, 2000);
    } finally {
      setSending(false);
    }
  };

  if (!user || !tenant) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen && (
        <div className="mb-2 w-80 rounded-lg border bg-card shadow-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">Aide & Feedback</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {sent ? (
            <div className="text-center py-4 text-sm text-green-600">Merci pour votre retour !</div>
          ) : !type ? (
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start gap-2 text-sm" onClick={() => setType('bug')}>
                Signaler un bug
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2 text-sm" onClick={() => setType('feature')}>
                Demander une fonctionnalité
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2 text-sm" onClick={() => setType('feedback')}>
                Feedback général
              </Button>
            </div>
          ) : (
            <>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Décrivez votre retour..."
                rows={4}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setType(null)}>Retour</Button>
                <Button size="sm" onClick={handleSubmit} disabled={sending || !message.trim()} className="gap-1">
                  <Send className="h-3 w-3" /> Envoyer
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      <Button
        size="icon"
        className="h-12 w-12 rounded-full shadow-lg"
        onClick={() => setIsOpen(!isOpen)}
      >
        <MessageCircleQuestion className="h-5 w-5" />
      </Button>
    </div>
  );
}
