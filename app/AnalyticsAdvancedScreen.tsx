import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    Image,
    Modal,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useAuth } from "./AuthProvider";
import { db } from "./firebase";
// Using chart-kit (Expo friendly)
import * as Clipboard from "expo-clipboard";
import { Alert, Animated, Easing } from "react-native";
import { G, Path, Svg, Text as SvgText } from "react-native-svg";

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

const COLORS = ["#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#7c3aed", "#0ea5a4", "#f97316"];

const WINDOW_WIDTH = Dimensions.get("window").width;
const CHART_WIDTH = Math.max(WINDOW_WIDTH - 48, 320);
const chartConfig = {
    backgroundGradientFrom: "#ffffff",
    backgroundGradientTo: "#ffffff",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(6,182,212, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(55,65,81, ${opacity})`,
    propsForBackgroundLines: { strokeWidth: 0.5, stroke: "#eef2f6" },
};

export default function AnalyticsAdvancedScreen() {
    const { user, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(true);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [selectedFilter, setSelectedFilter] = useState<{ type: "tag" | "month" | null; key: string | null }>({ type: null, key: null });
    const [drillOpen, setDrillOpen] = useState(false);
    const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
    // transient tooltip state (used by CSV copy / chart taps)
    const [tip, setTip] = useState<{ text: string } | null>(null);
    function showTip(text: string, ms = 1800) {
        setTip({ text });
        setTimeout(() => setTip(null), ms);
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
                console.warn("analytics snapshot error", err);
                setLoading(false);
            }
        );
        return unsub;
    }, [user?.email]);

    const totalAll = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);

    // months last 12
    const now = new Date();
    const months = useMemo(() => {
        const arr: { label: string; key: string; value: number }[] = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            arr.push({ label: d.toLocaleString(undefined, { month: "short" }), key, value: 0 });
        }
        expenses.forEach((e) => {
            const key = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, "0")}`;
            const m = arr.find((x) => x.key === key);
            if (m) m.value += e.amount;
        });
        return arr;
    }, [expenses]);

    // tags breakdown
    const tags = useMemo(() => {
        const map = new Map<string, number>();
        expenses.forEach((e) => {
            (e.tags || []).forEach((t) => map.set(t, (map.get(t) || 0) + e.amount));
        });
        if (map.size === 0) {
            const cmap = new Map<string, number>();
            expenses.forEach((e) => cmap.set(e.category || "Uncategorized", (cmap.get(e.category || "Uncategorized") || 0) + e.amount));
            return Array.from(cmap.entries()).map(([k, v]) => ({ key: k, value: v }));
        }
        return Array.from(map.entries()).map(([k, v]) => ({ key: k, value: v }));
    }, [expenses]);

    const drillList = useMemo(() => {
        if (!selectedFilter.type || !selectedFilter.key) return [];
        if (selectedFilter.type === "tag") {
            return expenses.filter((e) => (e.tags || []).includes(selectedFilter.key!)).sort((a, b) => b.date.getTime() - a.date.getTime());
        }
        if (selectedFilter.type === "month") {
            return expenses.filter((e) => {
                const m = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, "0")}`;
                return m === selectedFilter.key;
            }).sort((a, b) => b.date.getTime() - a.date.getTime());
        }
        return [];
    }, [selectedFilter, expenses]);

    // Animated bar and interactive pie: JS-only (react-native-svg + Animated)
    // helper: arc path for donut slice
    function polarToCartesian(cx: number, cy: number, r: number, angleInDegrees: number) {
        const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
        return { x: cx + r * Math.cos(angleInRadians), y: cy + r * Math.sin(angleInRadians) };
    }
    function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
        const start = polarToCartesian(cx, cy, r, endAngle);
        const end = polarToCartesian(cx, cy, r, startAngle);
        const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
        return [`M ${start.x} ${start.y}`, `A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`, `L ${cx} ${cy}`, "Z"].join(" ");
    }

    function AnimatedBarChart({
        data,
        onBarPress,
    }: {
        data: { label: string; key: string; value: number }[];
        onBarPress: (key: string) => void;
    }) {
        const max = Math.max(...data.map((d) => d.value), 1);

        function BarItem({ m }: { m: { label: string; key: string; value: number } }) {
            const target = Math.max(6, Math.round((m.value / max) * 160));
            const animRef = React.useRef(new Animated.Value(0));
            React.useEffect(() => {
                Animated.timing(animRef.current, {
                    toValue: target,
                    duration: 700,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: false,
                }).start();
            }, [target]);
            return (
                <TouchableOpacity
                    key={m.key}
                    onPress={() => onBarPress(m.key)}
                    activeOpacity={0.85}
                    style={{ width: 64, alignItems: "center", marginRight: 12 }}
                >
                    <View style={{ height: 160, justifyContent: "flex-end", width: 44 }}>
                        <Animated.View
                            style={{
                                width: 44,
                                height: animRef.current as any,
                                backgroundColor: "#7c3aed",
                                borderRadius: 8,
                                shadowColor: "#000",
                                shadowOpacity: 0.08,
                                elevation: 2,
                            }}
                        />
                    </View>
                    <Text numberOfLines={1} style={{ color: "#6b7280", fontSize: 11, marginTop: 6, textAlign: "center", width: 56 }}>
                        {m.label}
                    </Text>
                </TouchableOpacity>
            );
        }

        return (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 12 }}>
                {data.map((m) => (
                    <BarItem key={m.key} m={m} />
                ))}
            </ScrollView>
        );
    }

    function InteractiveDonut({
        data,
        size = 200,
        thickness = 44,
        onSlicePress,
    }: {
        data: { key: string; value: number }[];
        size?: number;
        thickness?: number;
        onSlicePress: (k: string) => void;
    }) {
        const total = data.reduce((s, d) => s + d.value, 0) || 1;
        const radius = size / 2;
        let cumulative = 0;
        return (
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <G>
                    {data.map((d, i) => {
                        const startAngle = (cumulative / total) * 360;
                        cumulative += d.value;
                        const endAngle = (cumulative / total) * 360;
                        const path = describeArc(radius, radius, radius - thickness / 2, startAngle, endAngle);
                        const midAngle = (startAngle + endAngle) / 2;
                        const labelPos = polarToCartesian(radius, radius, radius - thickness - 10, midAngle);
                        return (
                            <G key={d.key}>
                                <Path d={path} fill={COLORS[i % COLORS.length]} onPress={() => onSlicePress(d.key)} />
                                {/* small label circles could be added */}
                            </G>
                        );
                    })}
                    {/* center label */}
                    <SvgText x={radius} y={radius} textAnchor="middle" fontWeight="900" fontSize="14" fill="#0f172a">
                        Total
                    </SvgText>
                    <SvgText x={radius} y={radius + 18} textAnchor="middle" fontWeight="800" fontSize="12" fill="#059669">
                        ₹{Math.round(total)}
                    </SvgText>
                </G>
            </Svg>
        );
    }

    // CSV builder and copy helper
    function buildCSV(list: Expense[]) {
        const header = ["date", "time", "amount", "category", "description", "tags"].join(",");
        const rows = list.map((e) => {
            const date = e.date.toISOString().slice(0, 10);
            const time = e.date.toTimeString().slice(0, 5);
            const tags = (e.tags || []).join("|");
            const desc = `"${(e.description || "").replace(/"/g, '""')}"`;
            return [date, time, String(e.amount), e.category || "", desc, tags].join(",");
        });
        return [header, ...rows].join("\n");
    }

    if (authLoading || loading) {
        return (
            <SafeAreaView style={[s.safe, s.center]}>
                <ActivityIndicator size="large" color="#06b6d4" />
            </SafeAreaView>
        );
    }

    // prepare chart-kit data
    const barData = months; // used by AnimatedBarChart
    const pieData = tags; // used by InteractiveDonut

    return (
        <SafeAreaView style={s.safe}>
            <View style={s.header}>
                <Text style={s.title}>Advanced Dashboard</Text>
                <Text style={s.subtitle}>Total spent ₹{totalAll.toFixed(2)}</Text>
            </View>

            <ScrollView contentContainerStyle={{ padding: 12 }}>
                <View style={s.panel}>
                    <Text style={s.panelTitle}>Last 12 months (tap bar to drill)</Text>
                    <AnimatedBarChart
                        data={barData}
                        onBarPress={(key) => {
                            setSelectedFilter({ type: "month", key });
                            setDrillOpen(true);
                        }}
                    />
                </View>

                <View style={[s.panel, { marginTop: 12 }]}>
                    <Text style={s.panelTitle}>Spending by Tags (tap legend to drill)</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flex: 1, alignItems: "center" }}>
                            <InteractiveDonut
                                data={pieData}
                                size={200}
                                thickness={54}
                                onSlicePress={(k) => {
                                    setSelectedFilter({ type: "tag", key: k });
                                    setDrillOpen(true);
                                }}
                            />
                        </View>

                        <View style={{ width: 140, paddingLeft: 12 }}>
                            <Text style={{ fontWeight: "800", marginBottom: 8 }}>Top tags</Text>
                            {tags.slice(0, 8).map((t, i) => (
                                <TouchableOpacity
                                    key={t.key}
                                    onPress={() => {
                                        setSelectedFilter({ type: "tag", key: t.key });
                                        setDrillOpen(true);
                                    }}
                                    style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}
                                >
                                    <View style={{ width: 10, height: 10, backgroundColor: COLORS[i % COLORS.length], borderRadius: 4, marginRight: 8 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontWeight: "700" }}>{t.key}</Text>
                                        <Text style={{ color: "#6b7280" }}>₹{t.value.toFixed(0)}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>

                {/* Drill modal */}
                <Modal visible={drillOpen} animationType="slide">
                    <SafeAreaView style={{ flex: 1 }}>
                        <View style={{ padding: 12, flex: 1 }}>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                <Text style={{ fontWeight: "900", fontSize: 18 }}>
                                    {selectedFilter.type === "tag" ? `Tag: ${selectedFilter.key}` : selectedFilter.type === "month" ? `Month: ${selectedFilter.key}` : "Drill"}
                                </Text>
                                <TouchableOpacity onPress={() => setDrillOpen(false)}><Text style={{ color: "#06b6d4", fontWeight: "700" }}>Close</Text></TouchableOpacity>
                            </View>

                            <FlatList
                                data={drillList}
                                keyExtractor={(it) => it.id}
                                contentContainerStyle={{ paddingTop: 12 }}
                                renderItem={({ item }) => (
                                    <TouchableOpacity onPress={() => setDetailExpense(item)}>
                                        <View style={s.rowCard}>
                                            <View style={{ width: 100 }}>
                                                <Text style={{ fontWeight: "900" }}>₹{item.amount.toFixed(2)}</Text>
                                                <Text style={{ color: "#6b7280", fontSize: 12 }}>{item.date.toLocaleDateString()}</Text>
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ fontWeight: "800" }}>{item.description || "—"}</Text>
                                                <Text style={{ color: "#6b7280", marginTop: 6 }}>{item.category} • {(item.tags || []).join(", ")}</Text>
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                )}
                                ListEmptyComponent={<Text style={{ marginTop: 24, color: "#6b7280" }}>No expenses</Text>}
                            />
                            <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
                                <TouchableOpacity
                                    style={[s.primaryBtn, { flex: 1 }]}
                                    onPress={async () => {
                                        const csv = buildCSV(drillList);
                                        try {
                                            await Clipboard.setStringAsync(csv);
                                            showTip("CSV copied to clipboard");
                                        } catch (e) {
                                            Alert.alert("Copy failed", "Unable to copy CSV to clipboard");
                                        }
                                    }}
                                >
                                    <Text style={s.primaryBtnText}>Copy CSV</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[s.secondaryBtn, { flex: 1 }]}
                                    onPress={() => {
                                        const csv = buildCSV(drillList);
                                        // open simple modal to show CSV (reuse detail modal behavior)
                                        Alert.alert("CSV preview", "CSV copied to clipboard (use Copy CSV).");
                                    }}
                                >
                                    <Text style={s.secondaryBtnText}>Preview CSV</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </SafeAreaView>
                </Modal>

                {/* Detail expense modal */}
                <Modal visible={!!detailExpense} animationType="slide" transparent>
                    <View style={s.modalBackdrop}>
                        <View style={s.detailCard}>
                            {detailExpense && (
                                <>
                                    <Text style={{ fontWeight: "900", fontSize: 20 }}>₹{detailExpense.amount.toFixed(2)}</Text>
                                    <Text style={{ color: "#6b7280" }}>{detailExpense.date.toLocaleString()}</Text>
                                    <Text style={{ marginTop: 12, fontWeight: "700" }}>Description</Text>
                                    <Text style={{ marginTop: 6 }}>{detailExpense.description}</Text>

                                    <View style={{ flexDirection: "row", marginTop: 12 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: "#6b7280", fontWeight: "700" }}>Category</Text>
                                            <Text style={{ fontWeight: "800" }}>{detailExpense.category}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: "#6b7280", fontWeight: "700" }}>Payment</Text>
                                            <Text style={{ fontWeight: "800" }}>{detailExpense.paymentMethod || "—"}</Text>
                                        </View>
                                    </View>

                                    <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
                                        {(detailExpense.tags || []).map((t) => (
                                            <View key={t} style={{ backgroundColor: "#f3f4f6", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 16, marginRight: 6, marginBottom: 6 }}>
                                                <Text style={{ fontWeight: "700" }}>{t}</Text>
                                            </View>
                                        ))}
                                    </View>

                                    {detailExpense.photoUri ? <Image source={{ uri: detailExpense.photoUri }} style={{ width: "100%", height: 160, borderRadius: 8, marginTop: 12 }} /> : null}

                                    <TouchableOpacity onPress={() => setDetailExpense(null)} style={{ backgroundColor: "#06b6d4", padding: 12, borderRadius: 8, marginTop: 12, alignItems: "center" }}>
                                        <Text style={{ color: "#fff", fontWeight: "800" }}>Close</Text>
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    </View>
                </Modal>
            </ScrollView>

            {/* transient tooltip */}
            {tip ? (
                <View style={{ position: "absolute", left: 12, right: 12, top: 100, backgroundColor: "#111827", padding: 10, borderRadius: 10, alignItems: "center" }}>
                    <Text style={{ color: "#fff", fontWeight: "800" }}>{tip.text}</Text>
                </View>
            ) : null}
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#0f172a" },
    center: { justifyContent: "center", alignItems: "center" },
    header: { padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    title: { color: "#fff", fontSize: 20, fontWeight: "900" },
    subtitle: { color: "#9ca3af", fontWeight: "700" },
    panel: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 6 },
    panelTitle: { fontWeight: "900", marginBottom: 8, color: "#0f172a" },
    rowCard: { backgroundColor: "#fff", borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", marginBottom: 8 },
    modalBackdrop: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)" },
    detailCard: { width: "92%", backgroundColor: "#fff", padding: 16, borderRadius: 12 },
    primaryBtn: {
        backgroundColor: "#06b6d4",
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        elevation: 2,
    },
    primaryBtnText: { color: "#fff", fontWeight: "700" },
    secondaryBtn: {
        backgroundColor: "#374151",
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        elevation: 2,
    },
    secondaryBtnText: { color: "#fff", fontWeight: "700" },
});