"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { translations, type Lang } from "./translations";

interface LanguageContextType {
  lang: Lang;
  dir: "rtl" | "ltr";
  t: (key: string) => string;
  toggleLanguage: () => void;
  setLanguage: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "he",
  dir: "rtl",
  t: (key) => key,
  toggleLanguage: () => {},
  setLanguage: () => {},
});

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("he");

  // טעינה מ-localStorage
  useEffect(() => {
    const saved = localStorage.getItem("app-language") as Lang | null;
    if (saved === "en" || saved === "he") {
      setLangState(saved);
    }
  }, []);

  // עדכון dir על ה-html element
  useEffect(() => {
    const dir = lang === "he" ? "rtl" : "ltr";
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
  }, [lang]);

  const t = useCallback(
    (key: string): string => {
      return translations[lang][key] ?? translations.he[key] ?? key;
    },
    [lang],
  );

  const setLanguage = useCallback((newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem("app-language", newLang);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(lang === "he" ? "en" : "he");
  }, [lang, setLanguage]);

  return (
    <LanguageContext.Provider value={{ lang, dir: lang === "he" ? "rtl" : "ltr", t, toggleLanguage, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}
