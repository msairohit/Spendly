import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

const THEME_KEY = "spendly_theme_v1";

const lightColors = {
    backgroundDark: "#0f172a",
    background: "#f7fbff",
    surface: "#ffffff",
    primary: "#06b6d4",
    accent: "#0ea5a4",
    card: "#ffffff",
    text: "#0f172a",
    muted: "#6b7280",
    headerBg: "#ffffff",
    headerText: "#0f172a",
    danger: "#ef4444",
    palette: ["#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#7c3aed", "#0ea5a4", "#f97316"],
};

const darkColors = {
    backgroundDark: "#0f172a",
    background: "#071027",
    surface: "#0b1220",
    primary: "#06b6d4",
    accent: "#0ea5a4",
    card: "#071827",
    text: "#f8fafc",
    muted: "#9ca3af",
    headerBg: "#06202a",
    headerText: "#ffffff",
    danger: "#ff6b6b",
    palette: ["#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#7c3aed", "#0ea5a4", "#f97316"],
};

type ThemeType = { colors: typeof lightColors };

type ThemeState = {
    mode: "light" | "dark";
    theme: ThemeType;
    toggleTheme: () => Promise<void>;
    loading: boolean;
};

const ThemeContext = createContext<ThemeState>({
    mode: "dark",
    theme: { colors: darkColors },
    toggleTheme: async () => { },
    loading: false,
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
    const [mode, setMode] = useState<"light" | "dark">("dark");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const s = await AsyncStorage.getItem(THEME_KEY);
                if (s === "light" || s === "dark") setMode(s);
            } catch (e) {
                // ignore
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    async function toggleTheme() {
        const next = mode === "dark" ? "light" : "dark";
        setMode(next);
        try {
            await AsyncStorage.setItem(THEME_KEY, next);
        } catch (e) {
            // ignore
        }
    }

    const theme = { colors: mode === "dark" ? darkColors : lightColors };

    return (
        <ThemeContext.Provider value={{ mode, theme, toggleTheme, loading }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);