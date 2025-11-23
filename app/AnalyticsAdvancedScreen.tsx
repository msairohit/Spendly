
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
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import { G, Path, Svg, Text as SvgText } from "react-native-svg";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Clipboard from "expo-clipboard";

import { useAuth } from "./AuthProvider";
import { db } from "./firebase";
import { commonStyles, SIZES, COLORS } from "./styles/common";

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

const CHART_COLORS = ["#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#7c3aed", "#0ea5a4", "#f97316"];

export default function AnalyticsAdvancedScreen() {
    const { user, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(true);
    const [expenses, setExpenses] = useState<Expense[]>([]);

    // Date range state
    const nowDefault = new Date();
    const [startDate, setStartDate] = useState(() => new Date(nowDefault.getFullYear(), nowDefault.getMonth(), 1));
    const [endDate, setEndDate] = useState(() => new Date(nowDefault.getFullYear(), nowDefault.getMonth() + 1, 0, 23, 59, 59, 999));
    const [customRangeOpen, setCustomRangeOpen] = useState(false);

    // UI state
    const [selectedFilter, setSelectedFilter] = useState<{ type: "tag" | "month" | "week" | null; key: string | null }>({ type: null, key: null });
    const [drillOpen, setDrillOpen] = useState(false);
    const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
    const [tip, setTip] = useState<{ text: string } | null>(null);
    const [usePieForBoards, setUsePieForBoards] = useState<boolean>(false);

    // --- Data Fetching ---
    useEffect(() => {
        if (!user?.email) {
            setExpenses([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const userKey = encodeURIComponent(user.email);
        const colRef = collection(db, "users", userKey, "expenses");
        const q = query(colRef, orderBy("createdAt", "desc"));
        const unsub = onSnapshot(
            q,
            (snap) => {
                const list = snap.docs.map((d) => {
                    const data = d.data() as any;
                    const dateField = data.date?.toDate ? data.date.toDate() : (data.createdAt?.toDate ? data.createdAt.toDate() : new Date());
                    return {
                        id: d.id,
                        date: dateField,
                        description: data.description || "",
                        amount: Number(data.amount || 0),
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

    // --- Memoized Data Processing ---
    const filteredExpenses = useMemo(() => {
        return expenses.filter((ex) => ex.date >= startDate && ex.date <= endDate);
    }, [expenses, startDate, endDate]);

    const totalRange = useMemo(() => filteredExpenses.reduce((s, e) => s + e.amount, 0), [filteredExpenses]);

    // Data for charts
    const monthsData = useChartData(expenses, "month");
    const weeksData = useChartData(expenses, "week");
    const tagsData = useMemo(() => {
        const map = new Map<string, number>();
        filteredExpenses.forEach((e) => {
            (e.tags || []).forEach((t) => map.set(t, (map.get(t) || 0) + e.amount));
        });
        if (map.size === 0) {
            filteredExpenses.forEach((e) => cmap.set(e.category || "Uncategorized", (cmap.get(e.category || "Uncategorized") || 0) + e.amount));
        }
        return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
    }, [filteredExpenses]);

    const drillList = useDrilldownData(expenses, filteredExpenses, selectedFilter);
    const recent = useMemo(() => [...expenses].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5), [expenses]);

    if (authLoading || loading) {
        return (
            <SafeAreaView style={[commonStyles.safeArea, { justifyContent: "center", alignItems: "center" }]}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={commonStyles.safeArea}>
            <Text style={commonStyles.header}>Advanced Analytics</Text>
            <DateRangeSelector
                startDate={startDate}
                endDate={endDate}
                onRangeChange={(s, e) => { setStartDate(s); setEndDate(e); }}
                totalRange={totalRange}
            />
            <ScrollView contentContainerStyle={commonStyles.container}>
                <View style={styles.switchContainer}>
                    <Text style={styles.switchLabel}>Use Pie Chart</Text>
                    <Switch value={usePieForBoards} onValueChange={setUsePieForBoards} />
                </View>

                <ChartPanel
                    title="Monthly Summary"
                    data={monthsData}
                    usePie={usePieForBoards}
                    onPressItem={(key) => { setSelectedFilter({ type: "month", key }); setDrillOpen(true); }}
                />
                <ChartPanel
                    title="Weekly Summary"
                    data={weeksData}
                    usePie={usePieForBoards}
                    onPressItem={(key) => { setSelectedFilter({ type: "week", key }); setDrillOpen(true); }}
                />
                <ChartPanel
                    title="Spending by Tag"
                    data={tagsData}
                    usePie={true} // Always pie for tags
                    onPressItem={(key) => { setSelectedFilter({ type: "tag", key }); setDrillOpen(true); }}
                />

                <View style={styles.panel}>
                    <Text style={styles.panelTitle}>Recent Transactions</Text>
                    <ExpenseList expenses={recent} onExpensePress={setDetailExpense} />
                </View>

            </ScrollView>

            <DrilldownModal
                visible={drillOpen}
                onClose={() => setDrillOpen(false)}
                data={drillList}
                filter={selectedFilter}
                onExpensePress={setDetailExpense}
            />

            <ExpenseDetailModal
                expense={detailExpense}
                onClose={() => setDetailExpense(null)}
            />

            {tip && <View style={styles.tooltip}><Text style={styles.tooltipText}>{tip.text}</Text></View>}
        </SafeAreaView>
    );
}

// ... (DateRangeSelector, ChartPanel, ExpenseList, DrilldownModal, ExpenseDetailModal and other components/hooks here)

const styles = StyleSheet.create({
    switchContainer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingHorizontal: SIZES.padding,
        marginBottom: SIZES.base,
    },
    switchLabel: {
        marginRight: SIZES.base,
        fontSize: SIZES.font,
        fontWeight: "bold",
    },
    panel: {
        ...commonStyles.container,
        padding: SIZES.padding,
        marginBottom: SIZES.padding,
        backgroundColor: COLORS.white,
        borderRadius: SIZES.radius,
    },
    panelTitle: {
        fontSize: SIZES.h3,
        fontWeight: "bold",
        marginBottom: SIZES.base,
    },
    tooltip: {
        position: "absolute",
        top: 100,
        left: SIZES.padding,
        right: SIZES.padding,
        backgroundColor: COLORS.black,
        padding: SIZES.padding / 2,
        borderRadius: SIZES.radius,
        alignItems: "center",
    },
    tooltipText: {
        color: COLORS.white,
        fontWeight: "bold",
    },
});
