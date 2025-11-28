import * as Clipboard from "expo-clipboard";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Easing,
    FlatList,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import { G, Path, Svg, Text as SvgText } from "react-native-svg";
import { useAuth } from "./AuthProvider";
import { db } from "./firebase";
// Date picker
import DateTimePicker from "@react-native-community/datetimepicker";
import { SafeAreaView } from "react-native-safe-area-context";

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

export default function AnalyticsAdvancedScreen() {
    const { user, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(true);
    const [expenses, setExpenses] = useState<Expense[]>([]);

    // date range helpers (defaults to current month)
    function monthStart(d: Date) {
        return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
    }
    function monthEnd(d: Date) {
        return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    }
    const nowDefault = new Date();
    const [startDate, setStartDate] = useState<Date>(() => monthStart(nowDefault));
    const [endDate, setEndDate] = useState<Date>(() => monthEnd(nowDefault));
    const [customRangeOpen, setCustomRangeOpen] = useState(false);
    const [startInput, setStartInput] = useState<string>(() => startDate.toISOString().slice(0, 10));
    const [endInput, setEndInput] = useState<string>(() => endDate.toISOString().slice(0, 10));
    // date picker
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerFor, setPickerFor] = useState<"start" | "end">("start");
    const [pickerValue, setPickerValue] = useState<Date>(nowDefault);

    // UI / filters
    const [selectedFilter, setSelectedFilter] = useState<{ type: "tag" | "month" | "week" | null; key: string | null }>({ type: null, key: null });
    const [drillOpen, setDrillOpen] = useState(false);
    const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
    const [tip, setTip] = useState<{ text: string } | null>(null);
    const [usePieForBoards, setUsePieForBoards] = useState<boolean>(false); // global switch

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

    // date range controls
    function goPrevMonth() {
        const prev = new Date(startDate.getFullYear(), startDate.getMonth() - 1, 1);
        setStartDate(monthStart(prev));
        setEndDate(monthEnd(prev));
        setStartInput(monthStart(prev).toISOString().slice(0, 10));
        setEndInput(monthEnd(prev).toISOString().slice(0, 10));
    }
    function goNextMonth() {
        const next = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
        setStartDate(monthStart(next));
        setEndDate(monthEnd(next));
        setStartInput(monthStart(next).toISOString().slice(0, 10));
        setEndInput(monthEnd(next).toISOString().slice(0, 10));
    }
    function applyCustomRange() {
        Keyboard.dismiss();
        try {
            const s = new Date(startInput + "T00:00:00");
            const e = new Date(endInput + "T23:59:59");
            if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) {
                showTip("Invalid range");
                return;
            }
            setStartDate(s);
            setEndDate(e);
            setCustomRangeOpen(false);
        } catch (err) {
            showTip("Invalid date format (YYYY-MM-DD)");
        }
    }
    function clearToCurrentMonth() {
        const now = new Date();
        const s = monthStart(now);
        const e = monthEnd(now);
        setStartDate(s);
        setEndDate(e);
        setStartInput(s.toISOString().slice(0, 10));
        setEndInput(e.toISOString().slice(0, 10));
        setCustomRangeOpen(false);
        showTip("Reset to current month");
    }
    function openDatePicker(which: "start" | "end") {
        setPickerFor(which);
        setPickerValue(which === "start" ? startDate : endDate);
        setPickerOpen(true);
    }
    function onPickerChange(_: any, selected?: Date) {
        if (selected) {
            const iso = selected.toISOString().slice(0, 10);
            if (pickerFor === "start") {
                setStartInput(iso);
                setStartDate(new Date(selected.setHours(0, 0, 0, 0)));
            } else {
                setEndInput(iso);
                setEndDate(new Date(selected.setHours(23, 59, 59, 999)));
            }
        }
        if (Platform.OS === "android") setPickerOpen(false);
    }
    function confirmPickerIOS() {
        const iso = pickerValue.toISOString().slice(0, 10);
        if (pickerFor === "start") {
            setStartInput(iso);
            setStartDate(new Date(pickerValue.setHours(0, 0, 0, 0)));
        } else {
            setEndInput(iso);
            setEndDate(new Date(pickerValue.setHours(23, 59, 59, 999)));
        }
        setPickerOpen(false);
    }

    // filtered dataset (range)
    const filteredExpenses = useMemo(() => {
        return expenses.filter((ex) => ex.date >= startDate && ex.date <= endDate);
    }, [expenses, startDate, endDate]);

    const totalAll = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
    const totalRange = useMemo(() => filteredExpenses.reduce((s, e) => s + e.amount, 0), [filteredExpenses]);

    // last 12 months (based on endDate) - labels and keys YYYY-MM
    const monthsLast12 = useMemo(() => {
        // clamp ref so we don't use a future endDate (e.g. monthEnd) as the reporting anchor
        const ref = new Date(Math.min(endDate.getTime(), Date.now()));
        const arr: { label: string; key: string; value: number }[] = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            arr.push({ label: d.toLocaleString(undefined, { month: "short" }), key, value: 0 });
        }
        // Use ALL expenses for the summary board (per request)
        expenses.forEach((e) => {
            const key = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, "0")}`;
            const m = arr.find((x) => x.key === key);
            if (m) m.value += e.amount;
        });
        return arr;
    }, [expenses, endDate]);

    // last 8 weeks (week starts Monday) based on endDate
    const weeksLast8 = useMemo(() => {
        // clamp ref so the final week aligns with today when endDate is later (e.g. monthEnd)
        const ref = new Date(Math.min(endDate.getTime(), Date.now()));
        // helper: return Monday start of week
        function startOfWeek(d: Date) {
            const dd = new Date(d);
            const day = dd.getDay(); // 0 Sun .. 6 Sat
            const diff = (day + 6) % 7; // days since Monday
            dd.setDate(dd.getDate() - diff);
            dd.setHours(0, 0, 0, 0);
            return dd;
        }
        const weeks: { label: string; key: string; value: number; start: Date; end: Date }[] = [];
        const refStart = startOfWeek(ref);
        for (let i = 7; i >= 0; i--) {
            const wkStart = new Date(refStart.getFullYear(), refStart.getMonth(), refStart.getDate() - i * 7, 0, 0, 0, 0);
            const wkEnd = new Date(wkStart.getTime() + 7 * 24 * 3600 * 1000 - 1);
            const key = wkStart.toISOString().slice(0, 10);
            const label = wkStart.toLocaleDateString(undefined, { month: "short", day: "numeric" });
            weeks.push({ label, key, value: 0, start: wkStart, end: wkEnd });
        }
        // Use ALL expenses for the weekly summary board (per request)
        expenses.forEach((e) => {
            const idx = weeks.findIndex((w) => e.date >= w.start && e.date <= w.end);
            if (idx >= 0) weeks[idx].value += e.amount;
        });
        return weeks;
    }, [expenses, endDate]);

    // datasets used by Pie rendering — use ALL expenses for months/weeks per your request;
    // tags remain filtered
    const monthsForRender = useMemo(() => {
        const ref = new Date(Math.min(endDate.getTime(), Date.now()));
        const keys: string[] = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
            keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        }
        const map = new Map(keys.map((k) => [k, 0]));
        // months always use ALL expenses (global board)
        expenses.forEach((e) => {
            const key = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, "0")}`;
            if (map.has(key)) map.set(key, (map.get(key) || 0) + e.amount);
        });
        return Array.from(map.entries()).map(([k, v]) => ({ key: k, value: v, label: k }));
    }, [expenses, endDate]);

    const weeksForRender = useMemo(() => {
        const ref = new Date(Math.min(endDate.getTime(), Date.now()));
        function startOfWeek(d: Date) {
            const dd = new Date(d);
            const day = dd.getDay();
            const diff = (day + 6) % 7;
            dd.setDate(dd.getDate() - diff);
            dd.setHours(0, 0, 0, 0);
            return dd;
        }
        const refStart = startOfWeek(ref);
        const weeks: { key: string; value: number; label: string }[] = [];
        for (let i = 7; i >= 0; i--) {
            const wkStart = new Date(refStart.getFullYear(), refStart.getMonth(), refStart.getDate() - i * 7, 0, 0, 0, 0);
            const key = wkStart.toISOString().slice(0, 10);
            const label = wkStart.toLocaleDateString(undefined, { month: "short", day: "numeric" });
            weeks.push({ key, value: 0, label });
        }
        const map = new Map(weeks.map((w) => [w.key, w]));
        // weeks always use ALL expenses
        expenses.forEach((e) => {
            const wkStart = startOfWeek(e.date).toISOString().slice(0, 10);
            if (map.has(wkStart)) {
                const item = map.get(wkStart)!;
                item.value += e.amount;
            }
        });
        return Array.from(map.values()).map((w) => ({ key: w.key, value: w.value, label: w.label }));
    }, [expenses, endDate]);

    // tags breakdown (based on filtered range)
    const tags = useMemo(() => {
        const map = new Map<string, number>();
        filteredExpenses.forEach((e) => {
            (e.tags || []).forEach((t) => map.set(t, (map.get(t) || 0) + e.amount));
        });
        if (map.size === 0) {
            const cmap = new Map<string, number>();
            filteredExpenses.forEach((e) => cmap.set(e.category || "Uncategorized", (cmap.get(e.category || "Uncategorized") || 0) + e.amount));
            return Array.from(cmap.entries()).map(([k, v]) => ({ key: k, value: v }));
        }
        return Array.from(map.entries()).map(([k, v]) => ({ key: k, value: v }));
    }, [filteredExpenses]);

    // drill list supports tag, month (YYYY-MM), week (YYYY-MM-DD start)
    const drillList = useMemo(() => {
        // Tag drill should respect the active range (filteredExpenses).
        // Month/week drill (from the global summary boards) should use ALL expenses.
        const source = selectedFilter.type === "tag" ? filteredExpenses : expenses;
        if (!selectedFilter.type || !selectedFilter.key) return [];
        if (selectedFilter.type === "tag") {
            return source.filter((e) => (e.tags || []).includes(selectedFilter.key!)).sort((a, b) => b.date.getTime() - a.date.getTime());
        }
        if (selectedFilter.type === "month") {
            return source
                .filter((e) => {
                    const m = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, "0")}`;
                    return m === selectedFilter.key;
                })
                .sort((a, b) => b.date.getTime() - a.date.getTime());
        }
        if (selectedFilter.type === "week") {
            // key is yyyy-mm-dd start of week
            const weekStart = new Date(selectedFilter.key! + "T00:00:00");
            const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 3600 * 1000 - 1);
            return source.filter((e) => e.date >= weekStart && e.date <= weekEnd).sort((a, b) => b.date.getTime() - a.date.getTime());
        }
        return [];
    }, [selectedFilter, filteredExpenses, expenses]);

    // recent transactions (overall) for Top 5
    const recent = useMemo(() => {
        return [...expenses].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 6);
    }, [expenses]);

    // Animated bar and interactive donut (JS-only)
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
        showValue = false,
    }: {
        data: { label: string; key: string; value: number }[];
        onBarPress: (key: string) => void;
        showValue?: boolean;
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
                    style={{ width: 72, alignItems: "center", marginRight: 12 }}
                >
                    <View style={{ height: 160, justifyContent: "flex-end", width: 56 }}>
                        {showValue ? (
                            <Text style={{ position: "absolute", top: -18, left: 0, right: 0, textAlign: "center", fontWeight: "700", color: "#0f172a" }}>
                                ₹{Math.round(m.value)}
                            </Text>
                        ) : null}
                        <Animated.View
                            style={{
                                width: 56,
                                height: animRef.current as any,
                                backgroundColor: "#7c3aed",
                                borderRadius: 8,
                                shadowColor: "#000",
                                shadowOpacity: 0.08,
                                elevation: 2,
                            }}
                        />
                    </View>
                    <Text numberOfLines={1} style={{ color: "#6b7280", fontSize: 11, marginTop: 6, textAlign: "center", width: 64 }}>
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
                        return (
                            <G key={d.key}>
                                <Path d={path} fill={COLORS[i % COLORS.length]} onPress={() => onSlicePress(d.key)} />
                            </G>
                        );
                    })}
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

    // CSV builder
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

    // compute drill header text safely
    const drillHeader = useMemo(() => {
        if (!selectedFilter.type) return "Drill";
        const source = selectedFilter.type === "tag" ? filteredExpenses : expenses;
        if (selectedFilter.type === "tag") return `Tag: ${selectedFilter.key}`;
        if (selectedFilter.type === "month") {
            const list = source.filter((e) => {
                const m = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, "0")}`;
                return m === selectedFilter.key;
            });
            const total = list.reduce((s, x) => s + x.amount, 0);
            return `Month: ${selectedFilter.key} — Total ₹${total.toFixed(2)}`;
        }
        if (selectedFilter.type === "week") {
            const wkStart = new Date(selectedFilter.key! + "T00:00:00");
            const wkEnd = new Date(wkStart.getTime() + 7 * 24 * 3600 * 1000 - 1);
            const list = source.filter((e) => e.date >= wkStart && e.date <= wkEnd);
            const total = list.reduce((s, x) => s + x.amount, 0);
            return `Week start: ${selectedFilter.key} — Total ₹${total.toFixed(2)}`;
        }
        return "Drill";
    }, [selectedFilter, filteredExpenses, expenses]);

    if (authLoading || loading) {
        return (
            <SafeAreaView style={[s.safe, s.center]}>
                <ActivityIndicator size="large" color="#06b6d4" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={s.safe}>
            <View style={s.header}>
                <Text style={s.title}>Advanced Dashboard</Text>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={[s.subtitle, { marginRight: 8 }]}>Pie view</Text>
                    <Switch value={usePieForBoards} onValueChange={setUsePieForBoards} />
                    <View style={{ marginLeft: 12, alignItems: "flex-end" }}>
                        <Text style={s.subtitle}>Total (range) ₹{totalRange.toFixed(2)}</Text>
                        <Text style={{ color: "#9ca3af", fontSize: 12 }}>{startDate.toISOString().slice(0, 10)} → {endDate.toISOString().slice(0, 10)}</Text>
                    </View>
                </View>
            </View>

            {/* date range controls */}
            <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row" }}>
                        <TouchableOpacity onPress={goPrevMonth} style={[s.secondaryBtn, { paddingHorizontal: 12, marginRight: 8 }]}>
                            <Text style={s.secondaryBtnText}>Prev</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={goNextMonth} style={[s.secondaryBtn, { paddingHorizontal: 12 }]}>
                            <Text style={s.secondaryBtnText}>Next</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <TouchableOpacity onPress={() => setCustomRangeOpen((s) => !s)} style={[s.primaryBtn, { paddingHorizontal: 10 }]}>
                            <Text style={s.primaryBtnText}>{customRangeOpen ? "Close" : "Custom Range"}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
                {customRangeOpen ? (
                    <View style={{ marginTop: 8, backgroundColor: "#fff", padding: 12, borderRadius: 8 }}>
                        <View style={{ flexDirection: "row" }}>
                            <TouchableOpacity onPress={() => openDatePicker("start")} activeOpacity={0.8} style={{ flex: 1, borderWidth: 1, borderColor: "#eef2f7", padding: 12, borderRadius: 8, marginRight: 8 }}>
                                <Text style={{ color: "#0f172a" }}>{startInput || "YYYY-MM-DD"}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => openDatePicker("end")} activeOpacity={0.8} style={{ flex: 1, borderWidth: 1, borderColor: "#eef2f7", padding: 12, borderRadius: 8 }}>
                                <Text style={{ color: "#0f172a" }}>{endInput || "YYYY-MM-DD"}</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={{ flexDirection: "row", marginTop: 10 }}>
                            <TouchableOpacity onPress={applyCustomRange} style={[s.primaryBtn, { flex: 1, marginRight: 8 }]}>
                                <Text style={s.primaryBtnText}>Apply</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={clearToCurrentMonth} style={[s.secondaryBtn, { flex: 1 }]}>
                                <Text style={s.secondaryBtnText}>Reset to current month</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : null}
            </View>

            <ScrollView contentContainerStyle={{ padding: 12 }}>
                {/* 1. summary of last 12 months */}
                <View style={s.panel}>
                    <Text style={s.panelTitle}>Summary — Last 12 months</Text>
                    {usePieForBoards ? (
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                            <InteractiveDonut
                                data={monthsForRender.map((m) => ({ key: m.key, value: m.value }))}
                                size={220}
                                thickness={64}
                                onSlicePress={(key) => {
                                    setSelectedFilter({ type: "month", key });
                                    setDrillOpen(true);
                                }}
                            />
                            <View style={{ flex: 1, paddingLeft: 12 }}>
                                <Text style={{ fontWeight: "800", marginBottom: 8 }}>Months</Text>
                                {monthsLast12.map((m) => (
                                    <TouchableOpacity key={m.key} onPress={() => { setSelectedFilter({ type: "month", key: m.key }); setDrillOpen(true); }} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
                                        <Text style={{ fontWeight: "700" }}>{m.label}</Text>
                                        <Text style={{ color: "#6b7280" }}>₹{m.value.toFixed(0)}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    ) : (
                        <AnimatedBarChart
                            data={monthsLast12}
                            onBarPress={(key) => {
                                setSelectedFilter({ type: "month", key });
                                setDrillOpen(true);
                            }}
                            showValue
                        />
                    )}
                </View>

                {/* 2. summary of last 8 weeks */}
                <View style={[s.panel, { marginTop: 12 }]}>
                    <Text style={s.panelTitle}>Summary — Last 8 weeks</Text>
                    {usePieForBoards ? (
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                            <InteractiveDonut
                                data={weeksForRender.map((w) => ({ key: w.key, value: w.value }))}
                                size={220}
                                thickness={64}
                                onSlicePress={(key) => {
                                    setSelectedFilter({ type: "week", key });
                                    setDrillOpen(true);
                                }}
                            />
                            <View style={{ flex: 1, paddingLeft: 12 }}>
                                <Text style={{ fontWeight: "800", marginBottom: 8 }}>Weeks</Text>
                                {weeksLast8.map((w) => (
                                    <TouchableOpacity key={w.key} onPress={() => { setSelectedFilter({ type: "week", key: w.key }); setDrillOpen(true); }} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
                                        <Text style={{ fontWeight: "700" }}>{w.label}</Text>
                                        <Text style={{ color: "#6b7280" }}>₹{w.value.toFixed(0)}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    ) : (
                        <AnimatedBarChart
                            data={weeksLast8.map((w) => ({ label: w.label, key: w.key, value: w.value }))}
                            onBarPress={(key) => {
                                setSelectedFilter({ type: "week", key });
                                setDrillOpen(true);
                            }}
                            showValue
                        />
                    )}
                </View>

                {/* 3. spending by tags */}
                <View style={[s.panel, { marginTop: 12 }]}>
                    <Text style={s.panelTitle}>Spending by Tags</Text>
                    {/* Tags always use filtered data (per request) */}
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <InteractiveDonut
                            data={pieDataFromTags(tags)}
                            size={usePieForBoards ? 220 : 200}
                            thickness={usePieForBoards ? 64 : 54}
                            onSlicePress={(k) => {
                                setSelectedFilter({ type: "tag", key: k });
                                setDrillOpen(true);
                            }}
                        />
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

                {/* 4. Top 5 recent transactions (list) */}
                <View style={[s.panel, { marginTop: 12 }]}>
                    <Text style={s.panelTitle}>Top 5 recent transactions</Text>
                    {recent.length === 0 ? <Text style={s.emptyText}>No transactions</Text> : recent.slice(0, 5).map((r) => (
                        <TouchableOpacity key={r.id} onPress={() => setDetailExpense(r)}>
                            <View style={[s.rowCard, { marginBottom: 8 }]}>
                                <View style={{ width: 100 }}>
                                    <Text style={{ fontWeight: "900" }}>₹{r.amount.toFixed(2)}</Text>
                                    <Text style={{ color: "#6b7280", fontSize: 12 }}>{r.date.toLocaleDateString()}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontWeight: "800" }}>{r.description || "—"}</Text>
                                    <Text style={{ color: "#6b7280", marginTop: 6 }}>{r.category} • {(r.tags || []).slice(0, 3).join(", ")}</Text>
                                </View>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* date picker modal */}
                <Modal visible={pickerOpen} transparent onRequestClose={() => setPickerOpen(false)}>
                    <TouchableWithoutFeedback onPress={() => setPickerOpen(false)}>
                        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 20 }}>
                            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ backgroundColor: "#fff", borderRadius: 12, padding: 12 }}>
                                <DateTimePicker
                                    value={pickerValue}
                                    mode="date"
                                    display={Platform.OS === "ios" ? "inline" : "calendar"}
                                    onChange={(ev, d) => {
                                        if (d) setPickerValue(d);
                                        onPickerChange(ev, d || undefined);
                                    }}
                                />
                                {Platform.OS === "ios" ? (
                                    <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 8 }}>
                                        <TouchableOpacity onPress={() => setPickerOpen(false)} style={{ padding: 8, marginRight: 8 }}>
                                            <Text style={{ color: "#6b7280" }}>Cancel</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => confirmPickerIOS()} style={[s.primaryBtn, { paddingHorizontal: 12 }]}>
                                            <Text style={s.primaryBtnText}>Done</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : null}
                            </KeyboardAvoidingView>
                        </View>
                    </TouchableWithoutFeedback>
                </Modal>

                {/* Drill modal */}
                <Modal visible={drillOpen} animationType="slide" onRequestClose={() => setDrillOpen(false)} transparent={false}>
                    <SafeAreaView style={{ flex: 1 }}>
                        <TouchableWithoutFeedback onPress={() => setDrillOpen(false)}>
                            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
                        </TouchableWithoutFeedback>
                        <View style={{ padding: 12, flex: 1 }}>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                <Text style={{ fontWeight: "900", fontSize: 18 }}>{drillHeader}</Text>
                                <TouchableOpacity onPress={() => setDrillOpen(false)}>
                                    <Text style={{ color: "#06b6d4", fontWeight: "700" }}>Close</Text>
                                </TouchableOpacity>
                            </View>

                            <FlatList
                                data={drillList}
                                keyExtractor={(it) => it.id}
                                contentContainerStyle={{ paddingTop: 12, paddingBottom: 12 }}
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
                            <View style={{ marginTop: 12, flexDirection: "row" }}>
                                <TouchableOpacity
                                    style={[s.primaryBtn, { flex: 1, marginRight: 8 }]}
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
                                        Alert.alert("CSV preview", csv.slice(0, 2000) || "No data");
                                    }}
                                >
                                    <Text style={s.secondaryBtnText}>Preview CSV</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </SafeAreaView>
                </Modal>

                {/* Detail modal */}
                <Modal visible={!!detailExpense} animationType="slide" transparent onRequestClose={() => setDetailExpense(null)}>
                    <TouchableWithoutFeedback onPress={() => setDetailExpense(null)}>
                        <View style={s.modalBackdrop}>
                            <TouchableWithoutFeedback>
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
                            </TouchableWithoutFeedback>
                        </View>
                    </TouchableWithoutFeedback>
                </Modal>
            </ScrollView>

            {/* tooltip */}
            {tip ? (
                <View style={{ position: "absolute", left: 12, right: 12, top: 100, backgroundColor: "#111827", padding: 10, borderRadius: 10, alignItems: "center" }}>
                    <Text style={{ color: "#fff", fontWeight: "800" }}>{tip.text}</Text>
                </View>
            ) : null}
        </SafeAreaView>
    );

    // helper to convert tags list to donut-friendly array (keeps order)
    function pieDataFromTags(tagsArr: { key: string; value: number }[]) {
        return tagsArr.map((t) => ({ key: t.key, value: t.value }));
    }
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#0f172a" },
    center: { justifyContent: "center", alignItems: "center" },
    header: { paddingTop: Platform.OS === "android" ? 15 : 16, paddingHorizontal: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
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
    emptyText: { color: "#6b7280", padding: 12 },
});