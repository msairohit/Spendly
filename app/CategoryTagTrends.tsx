import DateTimePicker from "@react-native-community/datetimepicker";
import { useNavigation } from "@react-navigation/native";
import { router } from "expo-router";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "./AuthProvider";
import AppHeader from "./components/AppHeader";
import { db } from "./firebase";
import { useTheme } from "./theme";

type Expense = {
    id: string;
    date: Date;
    amount: number;
    category?: string;
    tags?: string[];
};

function toLocalISO(d: Date) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}
function parseToLocalDate(raw?: string | null, endOfDay = false): Date | null {
    if (!raw) return null;
    const s = String(raw);
    if (s.length <= 10 && !s.includes("T")) {
        const [yStr, mStr, dStr] = s.split("-");
        const y = Number(yStr || 0);
        const m = Math.max(0, Number(mStr || 1) - 1);
        const d = Number(dStr || 1);
        if (isFinite(y) && isFinite(m) && isFinite(d)) {
            if (endOfDay) return new Date(y, m, d, 23, 59, 59, 999);
            return new Date(y, m, d, 0, 0, 0, 0);
        }
    }
    const parsed = new Date(s);
    return isFinite(parsed.getTime()) ? parsed : null;
}

export default function CategoryTagTrends() {
    const { user } = useAuth();
    const nav: any = useNavigation();
    const { theme } = useTheme();

    // default: current month
    const now = new Date();
    const defaultFrom = toLocalISO(new Date(now.getFullYear(), now.getMonth(), 1));
    const defaultTo = toLocalISO(new Date(now.getFullYear(), now.getMonth(), now.getDate()));

    const [fromISO, setFromISO] = useState<string>(defaultFrom);
    const [toISO, setToISO] = useState<string>(defaultTo);

    const [showFromPicker, setShowFromPicker] = useState(false);
    const [showToPicker, setShowToPicker] = useState(false);
    const [fromPickerMode, setFromPickerMode] = useState<"date" | "time">("date");
    const [toPickerMode, setToPickerMode] = useState<"date" | "time">("date");
    const [fromTemp, setFromTemp] = useState<Date | null>(null);
    const [toTemp, setToTemp] = useState<Date | null>(null);

    const [loading, setLoading] = useState(true);
    const [expenses, setExpenses] = useState<Expense[]>([]);

    useEffect(() => {
        if (!user?.email) {
            setExpenses([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const userKey = encodeURIComponent(user.email);
        const userDocRef = doc(db, "users", userKey);
        const colRef = collection(userDocRef, "expenses");
        const q = query(colRef, orderBy("createdAt", "desc"));
        const unsub = onSnapshot(
            q,
            (snap) => {
                const list: Expense[] = snap.docs.map((d) => {
                    const data = d.data() as any;
                    const createdAt = data.createdAt;
                    const dateField = data.date
                        ? typeof data.date === "string"
                            ? new Date(data.date)
                            : createdAt?.toDate
                                ? createdAt.toDate()
                                : new Date(data.date)
                        : createdAt?.toDate
                            ? createdAt.toDate()
                            : new Date();
                    return {
                        id: d.id,
                        date: dateField,
                        amount: typeof data.amount === "number" ? data.amount : parseFloat(data.amount || "0"),
                        category: data.category || "Uncategorized",
                        tags: data.tags || [],
                    } as Expense;
                });
                setExpenses(list);
                setLoading(false);
            },
            (err) => {
                console.warn("CategoryTagTrends snapshot error", err);
                setLoading(false);
            }
        );
        return unsub;
    }, [user?.email]);

    // filter expenses by current from/to
    const fromDate = parseToLocalDate(fromISO);
    const toDate = parseToLocalDate(toISO, true);
    const filtered = useMemo(() => {
        if (!fromDate || !toDate) return [];
        return expenses.filter((e) => e.date >= fromDate && e.date <= toDate);
    }, [expenses, fromDate, toDate]);

    // aggregate top categories
    const categories = useMemo(() => {
        const map = new Map<string, number>();
        filtered.forEach((e) => {
            const key = e.category || "Uncategorized";
            map.set(key, (map.get(key) || 0) + e.amount);
        });
        return Array.from(map.entries())
            .map(([k, v]) => ({ category: k, total: v }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);
    }, [filtered]);

    // aggregate tags (sum amounts for each tag)
    const tags = useMemo(() => {
        const map = new Map<string, number>();
        filtered.forEach((e) => {
            (e.tags || []).forEach((t) => {
                if (!t) return;
                map.set(t, (map.get(t) || 0) + e.amount);
            });
        });
        return Array.from(map.entries())
            .map(([k, v]) => ({ tag: k, total: v }))
            .sort((a, b) => b.total - a.total);
    }, [filtered]);

    const totalAll = filtered.reduce((s, e) => s + e.amount, 0) || 1;

    function goToExpensesRange(start: Date, end: Date, extra?: { tag?: string; category?: string }) {
        const from = toLocalISO(start);
        const to = toLocalISO(end);
        try {
            if (nav && typeof nav.navigate === "function") {
                nav.navigate("ExpensesScreen", { filters: { from, to, ...(extra?.tag ? { tag: extra.tag } : {}), ...(extra?.category ? { category: extra.category } : {}) } });
                return;
            }
        } catch (e) { }
        try {
            const q = `/ExpensesScreen?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${extra?.tag ? `&tag=${encodeURIComponent(extra.tag)}` : ""}${extra?.category ? `&category=${encodeURIComponent(extra.category)}` : ""}`;
            router.push(q);
        } catch (e) {
            console.warn("navigate failed", e);
        }
    }

    if (loading) {
        return (
            <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
            <AppHeader title="Insights" subtitle="Categories & Tags" />
            <ScrollView contentContainerStyle={{ padding: 12 }}>
                <View style={[styles.panel, { backgroundColor: theme.colors.card }]}>
                    <Text style={[styles.label, { color: theme.colors.muted }]}>Date range</Text>

                    <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                        <TouchableOpacity
                            style={[styles.dateBox, { backgroundColor: theme.colors.surface }]}
                            onPress={() => {
                                setFromPickerMode("date");
                                setShowFromPicker(true);
                            }}
                        >
                            <Text style={{ color: theme.colors.muted }}>{fromISO}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.dateBox, { backgroundColor: theme.colors.surface }]}
                            onPress={() => {
                                setToPickerMode("date");
                                setShowToPicker(true);
                            }}
                        >
                            <Text style={{ color: theme.colors.muted }}>{toISO}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.btn, { backgroundColor: theme.colors.primary }]}
                            onPress={() => {
                                // reset to current month
                                setFromISO(defaultFrom);
                                setToISO(defaultTo);
                            }}
                        >
                            <Text style={{ color: theme.colors.card, fontWeight: "800" }}>Reset</Text>
                        </TouchableOpacity>
                    </View>

                    {showFromPicker && (
                        <DateTimePicker
                            value={fromTemp ?? parseToLocalDate(fromISO) ?? new Date()}
                            mode={fromPickerMode}
                            display={Platform.OS === "ios" ? "spinner" : "default"}
                            onChange={(e, selected) => {
                                if (e.type === "dismissed") {
                                    setShowFromPicker(false);
                                    setFromTemp(null);
                                    return;
                                }
                                const sel = selected || new Date();
                                if (fromPickerMode === "date") {
                                    setFromTemp(sel);
                                    setFromPickerMode("time");
                                    setTimeout(() => setShowFromPicker(true), 50);
                                } else {
                                    const base = fromTemp ?? new Date(sel.getFullYear(), sel.getMonth(), sel.getDate(), sel.getHours(), sel.getMinutes());
                                    base.setHours(sel.getHours(), sel.getMinutes(), 0, 0);
                                    setFromISO(toLocalISO(base));
                                    setShowFromPicker(false);
                                    setFromTemp(null);
                                    setFromPickerMode("date");
                                }
                            }}
                        />
                    )}

                    {showToPicker && (
                        <DateTimePicker
                            value={toTemp ?? parseToLocalDate(toISO, true) ?? new Date()}
                            mode={toPickerMode}
                            display={Platform.OS === "ios" ? "spinner" : "default"}
                            onChange={(e, selected) => {
                                if (e.type === "dismissed") {
                                    setShowToPicker(false);
                                    setToTemp(null);
                                    return;
                                }
                                const sel = selected || new Date();
                                if (toPickerMode === "date") {
                                    setToTemp(sel);
                                    setToPickerMode("time");
                                    setTimeout(() => setShowToPicker(true), 50);
                                } else {
                                    const base = toTemp ?? new Date(sel.getFullYear(), sel.getMonth(), sel.getDate(), sel.getHours(), sel.getMinutes());
                                    base.setHours(sel.getHours(), sel.getMinutes(), 59, 999);
                                    setToISO(toLocalISO(base));
                                    setShowToPicker(false);
                                    setToTemp(null);
                                    setToPickerMode("date");
                                }
                            }}
                        />
                    )}
                </View>

                <View style={[styles.panel, { backgroundColor: theme.colors.card, marginTop: 12 }]}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Top 5 categories</Text>
                    {categories.length === 0 ? (
                        <Text style={{ color: theme.colors.muted, marginTop: 8 }}>No data for selected range</Text>
                    ) : (
                        categories.map((c) => {
                            const pct = Math.round((c.total / totalAll) * 100);
                            return (
                                <TouchableOpacity
                                    key={c.category}
                                    style={styles.row}
                                    activeOpacity={0.85}
                                    onPress={() => {
                                        // navigate to expenses for this category & date range
                                        const start = parseToLocalDate(fromISO) || new Date();
                                        const end = parseToLocalDate(toISO, true) || new Date();
                                        goToCategory(start, end, c.category);
                                    }}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.itemTitle, { color: theme.colors.text }]}>{c.category}</Text>
                                        <Text style={{ color: theme.colors.muted }}>{`₹${c.total.toFixed(2)} • ${pct}%`}</Text>
                                    </View>
                                    <View style={{ width: 120, height: 20, backgroundColor: theme.colors.surface, borderRadius: 8, overflow: "hidden" }}>
                                        <View style={{ width: `${pct}%`, height: "100%", backgroundColor: theme.colors.primary }} />
                                    </View>
                                </TouchableOpacity>
                            );
                        })
                    )}
                </View>

                <View style={[styles.panel, { backgroundColor: theme.colors.card, marginTop: 12 }]}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Spending by tags</Text>
                    {tags.length === 0 ? (
                        <Text style={{ color: theme.colors.muted, marginTop: 8 }}>No tags in selected range</Text>
                    ) : (
                        <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start" }}>
                            {tags.map((t, idx) => {
                                const pct = Math.round((t.total / totalAll) * 100);
                                const color = (theme.colors.palette && theme.colors.palette[idx % theme.colors.palette.length]) || theme.colors.primary;
                                return (
                                    <TouchableOpacity
                                        key={t.tag}
                                        activeOpacity={0.9}
                                        onPress={() => {
                                            const start = parseToLocalDate(fromISO) || new Date();
                                            const end = parseToLocalDate(toISO, true) || new Date();
                                            goToTag(start, end, t.tag);
                                        }}
                                        style={[styles.tagCard, { backgroundColor: theme.colors.surface }]}
                                    >
                                        {/* show tag label on up to 2 lines, amount on second line; percentages removed */}
                                        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 14 }} numberOfLines={2}>
                                            {t.tag}
                                        </Text>
                                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                                            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>{`₹${t.total.toFixed(0)}`}</Text>
                                        </View>
                                        <View style={{ height: 10, backgroundColor: theme.colors.background, borderRadius: 8, marginTop: 8, overflow: "hidden" }}>
                                            <View style={{ width: `${pct}%`, height: "100%", backgroundColor: color }} />
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );

    function goToTag(start: Date, end: Date, tag: string) {
        try {
            if (nav && typeof nav.navigate === "function") {
                nav.navigate("ExpensesScreen", { filters: { from: toLocalISO(start), to: toLocalISO(end), tag } });
                return;
            }
        } catch (e) { }
        try {
            router.push(`/ExpensesScreen?from=${encodeURIComponent(toLocalISO(start))}&to=${encodeURIComponent(toLocalISO(end))}&tag=${encodeURIComponent(tag)}`);
        } catch (e) { }
    }

    function goToCategory(start: Date, end: Date, category: string) {
        try {
            if (nav && typeof nav.navigate === "function") {
                nav.navigate("ExpensesScreen", { filters: { from: toLocalISO(start), to: toLocalISO(end), category } });
                return;
            }
        } catch (e) { }
        try {
            router.push(`/ExpensesScreen?from=${encodeURIComponent(toLocalISO(start))}&to=${encodeURIComponent(toLocalISO(end))}&category=${encodeURIComponent(category)}`);
        } catch (e) { }
    }
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    panel: { borderRadius: 12, padding: 12 },
    label: { fontSize: 12, fontWeight: "700" },
    dateBox: { padding: 10, borderRadius: 10, minWidth: 110, justifyContent: "center" },
    btn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
    sectionTitle: { fontSize: 16, fontWeight: "900" },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
    itemTitle: { fontWeight: "800" },
    tagCard: { padding: 12, borderRadius: 12, marginBottom: 8, width: "48%" },
});