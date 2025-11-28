import React from "react";
import { StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme";

export default function AppHeader({
    title,
    subtitle,
    right,
    onBack,
}: {
    title: string;
    subtitle?: string;
    right?: React.ReactNode;
    onBack?: () => void;
}) {
    const { theme, toggleTheme, mode } = useTheme();

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.headerBg }]}>
            <StatusBar barStyle={mode === "dark" ? "light-content" : "dark-content"} backgroundColor={theme.colors.headerBg} />
            <View style={[styles.row, { paddingHorizontal: 14, paddingVertical: 10 }]}>
                {onBack ? (
                    <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                        <Text style={[styles.backText, { color: theme.colors.accent }]}>◀</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={styles.backSpacer} />
                )}

                <View style={styles.titleWrap}>
                    <Text style={[styles.title, { color: theme.colors.headerText }]} numberOfLines={1}>
                        {title}
                    </Text>
                    {subtitle ? (
                        <Text style={[styles.subtitle, { color: theme.colors.headerText }]} numberOfLines={1}>
                            {subtitle}
                        </Text>
                    ) : null}
                </View>

                <View style={styles.right}>
                    {right}
                    <TouchableOpacity onPress={() => toggleTheme()} style={styles.themeBtn}>
                        <Text style={{ color: theme.colors.headerText, fontWeight: "700" }}>{mode === "dark" ? "☼" : "🌙"}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { width: "100%" },
    row: { flexDirection: "row", alignItems: "center" },
    backBtn: { padding: 8 },
    backText: { fontSize: 18, fontWeight: "800" },
    backSpacer: { width: 40 },
    titleWrap: { flex: 1, paddingHorizontal: 8 },
    title: { fontSize: 18, fontWeight: "900" },
    subtitle: { fontSize: 12, opacity: 0.9 },
    right: { minWidth: 60, alignItems: "flex-end", flexDirection: "row", gap: 8 },
    themeBtn: { marginLeft: 10, padding: 8 },
});