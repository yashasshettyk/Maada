import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, kn, type StringKey } from './strings';
import { formatDate as fmtDate, type DateFormat } from '../../shared/dates';
import { formatDateKannada } from '../../shared/words-kn';

export type Lang = 'en' | 'kn';
type Vars = Record<string, string | number>;

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: StringKey, vars?: Vars) => string;
  /** Format a YYYY-MM-DD date for display in the current language. */
  date: (iso: string | null | undefined) => string;
}

const Ctx = createContext<I18n | null>(null);
const STORAGE_KEY = 'maada.lang';

function readLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'kn' ? 'kn' : 'en';
  } catch {
    return 'en';
  }
}

export function I18nProvider({ children, dateFormat = 'DD MMM YYYY' }: { children: ReactNode; dateFormat?: DateFormat }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* storage unavailable */ }
  }, []);
  const value = useMemo<I18n>(() => {
    const dict = lang === 'kn' ? kn : en;
    return {
      lang,
      setLang,
      t: (key, vars) => {
        let s: string = dict[key] ?? en[key] ?? key;
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
        return s;
      },
      date: (iso) => {
        if (!iso) return '';
        return lang === 'kn' && dateFormat === 'DD MMM YYYY' ? formatDateKannada(iso) : fmtDate(iso, dateFormat);
      },
    };
  }, [lang, setLang, dateFormat]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside provider');
  return v;
}
