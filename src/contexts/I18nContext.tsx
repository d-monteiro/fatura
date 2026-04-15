import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { type Lang, type TranslationKey, translate, setLang as setModuleLang } from '@/lib/i18n';

interface I18nContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem('faturai-lang');
    const initial: Lang = saved === 'en' ? 'en' : 'pt';
    setModuleLang(initial);
    return initial;
  });

  const changeLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    setModuleLang(newLang);
    localStorage.setItem('faturai-lang', newLang);
  }, []);

  const t = useCallback((key: TranslationKey) => translate(key, lang), [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang: changeLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
