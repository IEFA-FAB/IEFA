import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  // Inicia com o defaultTheme e sincroniza com o localStorage no client
  const [theme, setThemeState] = useState<Theme>(defaultTheme);

  // Carrega o tema salvo no localStorage (apenas no client)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(storageKey) as Theme | null;
      if (stored) setThemeState(stored);
    } catch {
      // Ignora falhas de acesso ao storage (ex.: modo privado)
    }
  }, [storageKey]);

  // Aplica a classe no <html> conforme o tema selecionado e observa mudanças do sistema quando "system"
  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = window.document.documentElement;
    const apply = (t: "light" | "dark") => {
      root.classList.remove("light", "dark");
      root.classList.add(t);
    };

    if (theme === "system") {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      apply(mql.matches ? "dark" : "light");

      const handler = (e: MediaQueryListEvent) => {
        // Reaplica somente se ainda estivermos em "system"
        if (theme === "system") {
          apply(e.matches ? "dark" : "light");
        }
      };

      mql.addEventListener?.("change", handler);
      return () => mql.removeEventListener?.("change", handler);
    }

    apply(theme);
  }, [theme]);

  const value: ThemeProviderState = {
    theme,
    setTheme: (t: Theme) => {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(storageKey, t);
        } catch {
          // Ignora falhas de storage
        }
      }
      setThemeState(t);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};
