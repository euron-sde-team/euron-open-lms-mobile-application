/**
 * Light, dark or the system setting, remembered across launches. Screens read colours
 * with `useTheme()`; nothing hardcodes a colour.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { PREF, prefs } from "../../lib/storage";
import { dark, light, type Palette } from "./tokens";

export type ThemeMode = "system" | "light" | "dark";

interface ThemeValue {
  colors: Palette;
  scheme: "light" | "dark";
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

function readMode(): ThemeMode {
  const v = prefs.getString(PREF.theme);
  return v === "light" || v === "dark" ? v : "system";
}

export function ThemeProvider({ children, initialMode }: { children: ReactNode; initialMode?: ThemeMode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(() => initialMode ?? readMode());
  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    prefs.setString(PREF.theme, m);
  }, []);
  const scheme: "light" | "dark" = mode === "system" ? (system === "dark" ? "dark" : "light") : mode;
  const value = useMemo<ThemeValue>(() => ({ colors: scheme === "dark" ? dark : light, scheme, mode, setMode }), [scheme, mode, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error("useTheme outside ThemeProvider");
  return v;
}
