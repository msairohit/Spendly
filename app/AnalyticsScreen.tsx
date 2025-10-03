import { router } from "expo-router";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
    Alert,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useAuth } from "./AuthProvider";
import { db } from "./firebase";

/**
 * AnalyticsScreen
 * - Reads expenses from users/{encodedEmail}/expenses
 * - Shows summary cards, monthly bar chart, top categories, sparkline
 * - Short timeframe toggles and CSV export
 *
 * References:
 * - auth provider: app/AuthProvider.tsx
 * - firestore: app/firebase.ts
 *
 * Route: /AnalyticsScreen (place this file in app/)
 */

type Expense = {
    id: string;
    date: Date;
    description: string;
    amount: number;
    category?: string;
    paymentMethod?: string | null;
    tags?: string[];
};

const COLORS = [
    "#06b6d4",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#7c3aed",
    "#0ea5a4",
    "#f97316",
];

export default function AnalyticsScreen() {
    const { user, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(true);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [daysRange, setDaysRange] = useState<number>(30);
    const [csvOpen, setCsvOpen] = useState(false);
    const [csvText, setCsvText] = useState("");

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
                        description: data.description || "",
                        amount: typeof data.amount === "number" ? data.amount : parseFloat(data.amount || "0"),
                        category: data.category || "Uncategorized",
                        paymentMethod: data.paymentMethod,
                        tags: data.tags || [],
                    } as Expense;
                });
                setExpenses(list);
                setLoading(false);
            },
            (err) => {
                console.warn("analytics snapshot error", err);
                setLoading(false);
            }
        );
        return unsub;
    }, [user?.email]);

    // Derived metrics
    const now = new Date();
    const since = new Date(now.getTime() - daysRange * 24 * 3600 * 1000);

    const filtered = useMemo(() => {
        return expenses.filter((e) => e.date >= since);
    }, [expenses, since]);

    const totalAllTime = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
    const totalRange = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered]);
    const avgPerDay = useMemo(() => (daysRange > 0 ? totalRange / daysRange : 0), [totalRange, daysRange]);

    const monthlySeries = useMemo(() => {
        // last 12 months totals
        const map = new Map<string, number>();
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            map.set(key, 0);
        }
        expenses.forEach((e) => {
            const key = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, "0")}`;
            if (map.has(key)) map.set(key, (map.get(key) || 0) + e.amount);
        });
        return Array.from(map.entries()).map(([k, v]) => ({ label: k, value: v }));
    }, [expenses]);

    const categoryBreakdown = useMemo(() => {
        const map = new Map<string, number>();
        expenses.forEach((e) => {
            const c = e.category || "Uncategorized";
            map.set(c, (map.get(c) || 0) + e.amount);
        });
        const arr = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
        const total = arr.reduce((s, [, v]) => s + v, 0) || 1;
        return arr.map(([k, v], i) => ({ key: k, value: v, pct: (v / total) * 100, color: COLORS[i % COLORS.length] }));
    }, [expenses]);

    const sparkline = useMemo(() => {
        // last N days small bars
        const map = new Map<string, number>();
        for (let i = daysRange - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            map.set(key, 0);
        }
        expenses.forEach((e) => {
            const key = e.date.toISOString().slice(0, 10);
            if (map.has(key)) map.set(key, (map.get(key) || 0) + e.amount);
        });
        return Array.from(map.entries()).map(([k, v]) => ({ label: k.slice(5), value: v }));
    }, [expenses, daysRange]);

    function buildCSV(list: Expense[]) {
        const header = ["date", "time", "amount", "category", "description", "tags"].join(",");
        const rows = list.map((e) => {
            const date = e.date.toISOString().slice(0, 10);
            const time = e.date.toTimeString().slice(0, 5);
            const tags = (e.tags || []).join("|");
            // escape description commas and quotes
            const desc = `"${(e.description || "").replace(/"/g, '""')}"`;
            return [date, time, String(e.amount), e.category || "", desc, tags].join(",");
        });
        return [header, ...rows].join("\n");
    }

    function onExportCSV() {
        const csv = buildCSV(expenses);
        setCsvText(csv);
        setCsvOpen(true);
    }

    if (authLoading || loading) {
        return (
            <SafeAreaView style={[styles.safe, styles.center]}>
                <Text style={{ color: "#fff", fontWeight: "800" }}>Loading analytics…</Text>
            </SafeAreaView>
        );
    }

    if (!user) {
        return (
            <SafeAreaView style={[styles.safe, styles.center]}>
                <Text style={styles.emptyTitle}>Not signed in</Text>
                <TouchableOpacity style={[styles.primaryBtn, { marginTop: 12 }]} onPress={() => router.push("/SignInScreen")}>
                    <Text style={styles.primaryBtnText}>Sign in</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.header}>
                <Text style={styles.title}>Dashboard</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity style={styles.smallPill} onPress={() => onExportCSV()}>
                        <Text style={styles.smallPillText}>Export CSV</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: 12 }}>
                {/* Summary cards */}
                <View style={styles.row}>
                    <View style={styles.card}>
                        <Text style={styles.cardLabel}>Total (all time)</Text>
                        <Text style={styles.cardValue}>₹{totalAllTime.toFixed(2)}</Text>
                    </View>
                    <View style={styles.card}>
                        <Text style={styles.cardLabel}>Last {daysRange} days</Text>
                        <Text style={styles.cardValue}>₹{totalRange.toFixed(2)}</Text>
                        <Text style={styles.cardSub}>avg ₹{avgPerDay.toFixed(2)}/day</Text>
                    </View>
                </View>

                {/* Time range toggles */}
                <View style={{ flexDirection: "row", marginTop: 10 }}>
                    {[7, 14, 30, 90].map((d) => (
                        <TouchableOpacity
                            key={d}
                            onPress={() => setDaysRange(d)}
                            style={[styles.rangeBtn, daysRange === d && styles.rangeBtnActive]}
                        >
                            <Text style={[styles.rangeText, daysRange === d && styles.rangeTextActive]}>{d}d</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Sparkline */}
                <View style={[styles.panel, { marginTop: 12 }]}>
                    <Text style={styles.panelTitle}>Spending (last {daysRange} days)</Text>
                    <View style={styles.sparkWrap}>
                        {sparkline.length === 0 ? (
                            <Text style={styles.emptyText}>No data</Text>
                        ) : (
                            sparkline.map((s, i) => {
                                const max = Math.max(...sparkline.map((x) => x.value), 1);
                                const h = Math.max(6, (s.value / max) * 60);
                                return <View key={s.label} style={{ width: 8, height: h, marginHorizontal: 3, backgroundColor: "#06b6d4", borderRadius: 4, alignSelf: "flex-end" }} />;
                            })
                        )}
                    </View>
                </View>

                {/* Monthly bar chart */}
                <View style={[styles.panel, { marginTop: 12 }]}>
                    <Text style={styles.panelTitle}>Monthly (last 12 months)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 12 }}>
                        {monthlySeries.map((m, i) => {
                            const max = Math.max(...monthlySeries.map((x) => x.value), 1);
                            const h = Math.max(10, (m.value / max) * 140);
                            return (
                                <TouchableOpacity key={m.label} style={{ width: 48, alignItems: "center", marginRight: 12 }} onPress={() => { }}>
                                    <View style={{ height: 160, justifyContent: "flex-end" }}>
                                        <View style={{ height: h, width: 28, backgroundColor: "#7c3aed", borderRadius: 6 }} />
                                    </View>
                                    <Text style={styles.smallLabel}>{m.label.split("-")[1]}/{m.label.split("-")[0].slice(2)}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Top categories */}
                <View style={[styles.panel, { marginTop: 12 }]}>
                    <Text style={styles.panelTitle}>Top categories</Text>
                    {categoryBreakdown.length === 0 && <Text style={styles.emptyText}>No categories yet</Text>}
                    {categoryBreakdown.map((c) => (
                        <View key={c.key} style={styles.categoryRow}>
                            <View style={[styles.legendDot, { backgroundColor: c.color }]} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.catName}>{c.key}</Text>
                                <Text style={styles.catSub}>₹{c.value.toFixed(2)} • {c.pct.toFixed(1)}%</Text>
                            </View>
                            <View style={{ width: 120, height: 10, backgroundColor: "#eef2f7", borderRadius: 6, overflow: "hidden" }}>
                                <View style={{ width: `${Math.min(100, c.pct)}%`, height: 10, backgroundColor: c.color }} />
                            </View>
                        </View>
                    ))}
                </View>

                {/* Quick insights */}
                <View style={[styles.panel, { marginTop: 12, marginBottom: 80 }]}>
                    <Text style={styles.panelTitle}>Quick insights</Text>
                    <Text style={styles.insightText}>- Most spent category: {categoryBreakdown[0]?.key || "—"}</Text>
                    <Text style={styles.insightText}>- Average daily (range): ₹{avgPerDay.toFixed(2)}</Text>
                    <TouchableOpacity style={[styles.primaryBtn, { marginTop: 12 }]} onPress={() => onExportCSV()}>
                        <Text style={styles.primaryBtnText}>Open CSV (copy)</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            {/* CSV modal */}
            <Modal visible={csvOpen} animationType="slide">
                <SafeAreaView style={{ flex: 1 }}>
                    <View style={{ padding: 12, flex: 1 }}>
                        <Text style={{ fontWeight: "800", marginBottom: 8 }}>CSV export (copy & paste)</Text>
                        <TextInput
                            value={csvText}
                            onChangeText={setCsvText}
                            multiline
                            style={{ flex: 1, backgroundColor: "#fff", padding: 10, borderRadius: 8 }}
                        />
                        <View style={{ flexDirection: "row", marginTop: 12 }}>
                            <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={() => { setCsvOpen(false); Alert.alert("Copied", "You can now paste the CSV where needed."); }}>
                                <Text style={styles.primaryBtnText}>Close</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#0f172a" },
    center: { justifyContent: "center", alignItems: "center" },
    header: {
        paddingTop: Platform.OS === "ios" ? 36 : 16,
        paddingHorizontal: 18,
        paddingBottom: 12,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: "#06202a",
    },
    title: { color: "#fff", fontSize: 20, fontWeight: "800" },
    smallPill: { backgroundColor: "#083344", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999 },
    smallPillText: { color: "#a7f3d0", fontWeight: "700" },

    row: { flexDirection: "row", gap: 12, alignItems: "stretch" },
    card: { flex: 1, backgroundColor: "#fff", padding: 12, borderRadius: 12, margin: 4 },
    cardLabel: { color: "#6b7280", fontWeight: "700" },
    cardValue: { fontSize: 18, fontWeight: "900", marginTop: 8 },
    cardSub: { color: "#6b7280", marginTop: 6 },

    rangeBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#fff", marginRight: 8, borderRadius: 999 },
    rangeBtnActive: { backgroundColor: "#06b6d4" },
    rangeText: { color: "#0f172a", fontWeight: "700" },
    rangeTextActive: { color: "#fff" },

    panel: { backgroundColor: "#fff", borderRadius: 12, padding: 12 },
    panelTitle: { fontWeight: "800", marginBottom: 8 },
    sparkWrap: { flexDirection: "row", alignItems: "flex-end", height: 80, paddingVertical: 6 },

    smallLabel: { color: "#6b7280", fontSize: 11, marginTop: 6, textAlign: "center" },

    categoryRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
    legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
    catName: { fontWeight: "700" },
    catSub: { color: "#6b7280", fontSize: 12 },

    insightText: { color: "#374151", marginTop: 6 },
    primaryBtn: { backgroundColor: "#06b6d4", padding: 12, borderRadius: 10, alignItems: "center" },
    primaryBtnText: { color: "#fff", fontWeight: "800" },

    emptyText: { color: "#6b7280" },

    emptyTitle: { color: "#fff", fontWeight: "800" },

    // fallback for gap (older RN)
    // using manual margin in some places above
});