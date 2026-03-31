import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase/client';
import { FileText, Loader2 } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center gradient-dark px-4">
      <div className="w-full max-w-sm animate-fade-in-up">
        {/* Branding */}
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent">
            <FileText className="h-7 w-7 text-accent-foreground" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white">
            Fatura<span className="text-accent">AI</span>
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Gestion intelligente de factures
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-6 shadow-card-hover sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm transition-colors focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="email@exemple.fr"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm transition-colors focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl gradient-primary px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Se connecter
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
