import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { router } from "expo-router";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Animated, Easing, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Circle, G, Path, Svg, Text as SvgText } from "react-native-svg";
import { useAuth } from "./AuthProvider";
import AppHeader from "./components/AppHeader";
import { db } from "./firebase";
import { useTheme } from "./theme";

type Expense = {
    id: string;
    date: Date;
    description: string;
    amount: number;
    category?: string;
    paymentMethod?: string | null;
    tags?: string[];
    photoUri?: string | null;
};

export default function TrendsScreen() {
    const { user } = useAuth();
    const nav: any = useNavigation();
    const { theme } = useTheme();
    const [loading, setLoading] = useState(true);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    // monthly limit state (persisted)
    const LIMIT_KEY = "spendly_monthly_limit_v1";
    const DEFAULT_LIMIT = 20000;
    const [monthlyLimit, setMonthlyLimit] = useState<number>(DEFAULT_LIMIT);
    const [limitInput, setLimitInput] = useState<string>(String(DEFAULT_LIMIT));
    const [limitLoading, setLimitLoading] = useState(true);
    useEffect(() => {
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(LIMIT_KEY);
                const v = raw ? Number(raw) : DEFAULT_LIMIT;
                if (!isFinite(v) || v <= 0) {
                    setMonthlyLimit(DEFAULT_LIMIT);
                    setLimitInput(String(DEFAULT_LIMIT));
                } else {
                    setMonthlyLimit(v);
                    setLimitInput(String(v));
                }
            } catch (e) {
                setMonthlyLimit(DEFAULT_LIMIT);
                setLimitInput(String(DEFAULT_LIMIT));
            } finally {
                setLimitLoading(false);
            }
        })();
    }, []);
    async function saveLimit() {
        const v = Number(limitInput.replace(/[^0-9.]/g, "")) || 0;
        const final = v > 0 ? v : DEFAULT_LIMIT;
        setMonthlyLimit(final);
        try {
            await AsyncStorage.setItem(LIMIT_KEY, String(final));
        } catch (e) {
            console.warn("save limit failed", e);
        }
    }

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
                const list = snap.docs.map((d) => {
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
                        photoUri: data.photoUri || null,
                    } as Expense;
                });
                setExpenses(list);
                setLoading(false);
            },
            (err) => {
                console.warn("trends snapshot error", err);
                setLoading(false);
            }
        );
        return unsub;
    }, [user?.email]);

    // months: last 12 months totals (uses transaction dates)
    const monthsLast12 = useMemo(() => {
        const now = new Date();
        const ref = new Date(Math.min(now.getTime(), Date.now()));
        const arr: { key: string; label: string; value: number; start: Date; end: Date }[] = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
            const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
            arr.push({ key, label: d.toLocaleString(undefined, { month: "short" }), value: 0, start, end });
        }
        expenses.forEach((e) => {
            const key = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, "0")}`;
            const it = arr.find((a) => a.key === key);
            if (it) it.value += e.amount;
        });
        return arr;
    }, [expenses]);

    // weeks: last 8 weeks totals (week starts Monday)
    const weeksLast8 = useMemo(() => {
        const now = new Date();
        function startOfWeek(d: Date) {
            const dd = new Date(d);
            const day = (dd.getDay() + 6) % 7; // 0 = Monday
            dd.setDate(dd.getDate() - day);
            dd.setHours(0, 0, 0, 0);
            return dd;
        }
        const ref = new Date(Math.min(now.getTime(), Date.now()));
        const refStart = startOfWeek(ref);
        const weeks: { key: string; label: string; value: number; start: Date; end: Date }[] = [];
        for (let i = 7; i >= 0; i--) {
            const start = new Date(refStart.getFullYear(), refStart.getMonth(), refStart.getDate() - i * 7, 0, 0, 0, 0);
            const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000 - 1);
            const key = start.toISOString().slice(0, 10);
            const label = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
            weeks.push({ key, label, value: 0, start, end });
        }
        expenses.forEach((e) => {
            const idx = weeks.findIndex((w) => e.date >= w.start && e.date <= w.end);
            if (idx >= 0) weeks[idx].value += e.amount;
        });
        return weeks;
    }, [expenses]);

    function toLocalISODate(d: Date) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    }

    function goToExpensesRange(start: Date, end: Date) {
        const from = toLocalISODate(start); // date-only string
        const to = toLocalISODate(end);     // date-only string
        try {
            if (nav && typeof nav.navigate === "function") {
                nav.navigate("ExpensesScreen", { filters: { from, to } });
                return;
            }
        } catch (e) {
            // fallback
        }
        try {
            router.push(`/ExpensesScreen?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
        } catch (e) {
            console.warn("navigate to expenses failed", e);
        }
    }

    // Simple animated bar chart with totals displayed above each bar
    function AnimatedBarChart({ data, onBarPress }: { data: { label: string; key: string; value: number; start: Date; end: Date }[]; onBarPress: (s: Date, e: Date) => void }) {
        const max = Math.max(...data.map((d) => d.value), 1);
        return (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 12 }}>
                {data.map((d, i) => {
                    const height = Math.max(6, Math.round((d.value / max) * 160));
                    const anim = React.useRef(new Animated.Value(0)).current;
                    React.useEffect(() => {
                        Animated.timing(anim, { toValue: height, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
                    }, [height]);
                    return (
                        <TouchableOpacity key={d.key} onPress={() => onBarPress(d.start, d.end)} activeOpacity={0.85} style={{ width: 72, alignItems: "center", marginRight: 12 }}>
                            {/* total label */}
                            <Text style={{ color: theme.colors.text, fontWeight: "800", marginBottom: 6 }}>{`₹${Math.round(d.value)}`}</Text>
                            <View style={{ height: 160, justifyContent: "flex-end", width: 56 }}>
                                <Animated.View style={{ width: 56, height: anim as any, backgroundColor: theme.colors.primary, borderRadius: 8 }} />
                            </View>
                            <Text numberOfLines={1} style={{ color: theme.colors.muted, marginTop: 8, fontSize: 12, textAlign: "center", width: 72 }}>
                                {d.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        );
    }

    // Simple donut using SVG (slices tappable)
    function InteractiveDonut({ data, onSlicePress, size = 180, thickness = 50 }: { data: { label: string; key: string; value: number; start: Date; end: Date }[]; onSlicePress: (s: Date, e: Date) => void; size?: number; thickness?: number }) {
        const total = data.reduce((s, d) => s + d.value, 0) || 1;
        const radius = size / 2;
        let cumulative = 0;
        const palette = theme.colors.palette ?? ["#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#7c3aed", "#0ea5a4", "#f97316"];
        function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
            const a = ((angle - 90) * Math.PI) / 180;
            return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
        }
        function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
            const start = polarToCartesian(cx, cy, r, endAngle);
            const end = polarToCartesian(cx, cy, r, startAngle);
            const large = endAngle - startAngle <= 180 ? "0" : "1";
            return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y} L ${cx} ${cy} Z`;
        }
        return (
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <G>
                    {data.map((d, i) => {
                        const startAngle = (cumulative / total) * 360;
                        cumulative += d.value;
                        const endAngle = (cumulative / total) * 360;
                        const path = describeArc(radius, radius, radius - thickness / 2, startAngle, endAngle);
                        const color = palette[i % palette.length];
                        return <Path key={d.key} d={path} fill={color} onPress={() => onSlicePress(d.start, d.end)} />;
                    })}
                    <SvgText x={radius} y={radius} textAnchor="middle" fontWeight="900" fontSize="12" fill={theme.colors.text}>
                        Total
                    </SvgText>
                    <SvgText x={radius} y={radius + 18} textAnchor="middle" fontWeight="800" fontSize="12" fill={theme.colors.primary}>
                        ₹{Math.round(total)}
                    </SvgText>
                </G>
            </Svg>
        );
    }

    if (loading) {
        return (
            <SafeAreaView style={[s.safe, s.center, { backgroundColor: theme.colors.background }]}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[s.safe, { backgroundColor: theme.colors.background }]}>
            <AppHeader title="Trends" subtitle="Last 12 months · Last 8 weeks" />
            <ScrollView contentContainerStyle={{ padding: 12 }}>
                {/* Monthly budget block */}
                <View style={[s.panel, { backgroundColor: theme.colors.card, marginTop: 12 }]}>
                    <View style={s.blockHeader}>
                        <Text style={[s.blockTitle, { color: theme.colors.text }]}>Monthly Budget</Text>
                    </View>
                    {/* compute current month total */}
                    {(() => {
                        const now = new Date();
                        const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
                        const curMonth = monthsLast12.find((m) => m.key === curKey);
                        const currentTotal = curMonth ? curMonth.value : 0;
                        const remaining = Math.round(monthlyLimit - currentTotal);
                        const pct = monthlyLimit > 0 ? Math.min(1, currentTotal / monthlyLimit) : 1;
                        const size = 120;
                        const thickness = 22;
                        const radius = (size - thickness) / 2;
                        const circumference = 2 * Math.PI * radius;
                        const strokeDashoffset = circumference * (1 - pct);
                        return (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                                <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
                                    <Svg width={size} height={size}>
                                        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
                                            <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.colors.background} strokeWidth={thickness} fill="transparent" />
                                            <Circle
                                                cx={size / 2}
                                                cy={size / 2}
                                                r={radius}
                                                stroke={currentTotal > monthlyLimit ? "#ef4444" : theme.colors.primary}
                                                strokeWidth={thickness}
                                                strokeLinecap="round"
                                                strokeDasharray={`${circumference} ${circumference}`}
                                                strokeDashoffset={strokeDashoffset}
                                                fill="transparent"
                                            />
                                        </G>
                                    </Svg>
                                    <View style={{ position: "absolute", alignItems: "center" }}>
                                        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{`₹${Math.round(currentTotal)}`}</Text>
                                        <Text style={{ color: theme.colors.muted, fontSize: 12 }}>spent</Text>
                                    </View>
                                </View>

                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: theme.colors.muted, marginBottom: 8 }}>Set monthly spend limit</Text>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                        <TextInput
                                            value={limitInput}
                                            onChangeText={setLimitInput}
                                            keyboardType="numeric"
                                            style={styles.limitInput}
                                            placeholder="20000"
                                        />
                                        <TouchableOpacity onPress={saveLimit} style={styles.saveBtn}>
                                            <Text style={{ color: "#fff", fontWeight: "800" }}>Save</Text>
                                        </TouchableOpacity>
                                    </View>

                                    <Text style={{ marginTop: 12, fontSize: 18, fontWeight: "900", color: remaining < 0 ? "#ef4444" : theme.colors.primary }}>
                                        {remaining < 0 ? `Over by ₹${Math.abs(remaining)}` : `₹${remaining} remaining`}
                                    </Text>
                                    <Text style={{ color: theme.colors.muted, marginTop: 6 }}>
                                        {`Limit: ₹${monthlyLimit.toFixed(0)} • Spent: ₹${Math.round(currentTotal)}`}
                                    </Text>
                                </View>
                            </View>
                        );
                    })()}
                </View>

                {/* Months block */}
                <View style={[s.panel, { backgroundColor: theme.colors.card }]}>
                    <View style={s.blockHeader}>
                        <Text style={[s.blockTitle, { color: theme.colors.text }]}>Last 12 months</Text>
                    </View>
                    <AnimatedBarChart
                        data={monthsLast12.map((m) => ({ label: m.label, key: m.key, value: m.value, start: m.start, end: m.end }))}
                        onBarPress={(s, e) => goToExpensesRange(s, e)}
                    />
                </View>

                {/* Weeks block */}
                <View style={[s.panel, { backgroundColor: theme.colors.card, marginTop: 12 }]}>
                    <View style={s.blockHeader}>
                        <Text style={[s.blockTitle, { color: theme.colors.text }]}>Last 8 weeks</Text>
                    </View>
                    <AnimatedBarChart
                        data={weeksLast8.map((w) => ({ label: w.label, key: w.key, value: w.value, start: w.start, end: w.end }))}
                        onBarPress={(s, e) => goToExpensesRange(s, e)}
                    />
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1 },
    center: { justifyContent: "center", alignItems: "center" },
    panel: { borderRadius: 12, padding: 12 },
    blockHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    blockTitle: { fontSize: 16, fontWeight: "900" },
    toggleBtn: { paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
    limitInput: { padding: 10, borderRadius: 10, backgroundColor: "#fff", minWidth: 120 },
    saveBtn: { backgroundColor: "#06b6d4", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
});

const styles = StyleSheet.create({
    limitInput: {
        flex: 1,
        height: 40,
        borderColor: "#ccc",
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        color: "#333",
        fontSize: 16,
    },
    saveBtn: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 8,
        backgroundColor: "#4caf50",
        alignItems: "center",
        justifyContent: "center",
    },
});