
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
import { commonStyles, SIZES, COLORS } from "./styles/common";

type Expense = {
    id: string;
    date: Date;
    description: string;
    amount: number;
    category?: string;
    paymentMethod?: string | null;
    tags?: string[];
};

const CHART_COLORS = ["#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#7c3aed", "#0ea5a4", "#f97316"];

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
        const colRef = collection(db, "users", userKey, "expenses");
        const q = query(colRef, orderBy("createdAt", "desc"));
        const unsub = onSnapshot(
            q,
            (snap) => {
                const list: Expense[] = snap.docs.map((d) => {
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
                    };
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

    const now = new Date();
    const since = new Date(now.getTime() - daysRange * 24 * 3600 * 1000);

    const filtered = useMemo(() => expenses.filter((e) => e.date >= since), [expenses, since]);
    const totalAllTime = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
    const totalRange = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered]);
    const avgPerDay = useMemo(() => (daysRange > 0 ? totalRange / daysRange : 0), [totalRange, daysRange]);

    const monthlySeries = useChartData(expenses, "month");
    const categoryBreakdown = useCategoryData(expenses);
    const sparkline = useSparklineData(expenses, daysRange);

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
            <SafeAreaView style={[commonStyles.safeArea, { justifyContent: "center", alignItems: "center" }]}>
                <Text style={{ color: COLORS.primary, fontWeight: "bold" }}>Loading analytics...</Text>
            </SafeAreaView>
        );
    }

    if (!user) {
        return (
            <SafeAreaView style={[commonStyles.safeArea, { justifyContent: "center", alignItems: "center" }]}>
                <Text style={commonStyles.header}>Not signed in</Text>
                <TouchableOpacity style={[commonStyles.button, { marginTop: SIZES.padding }]} onPress={() => router.push("/SignInScreen")}>
                    <Text style={commonStyles.buttonText}>Sign in</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={commonStyles.safeArea}>
             <Text style={commonStyles.header}>Dashboard</Text>
            <ScrollView contentContainerStyle={commonStyles.container}>
                <SummaryCards totalAllTime={totalAllTime} totalRange={totalRange} daysRange={daysRange} avgPerDay={avgPerDay} />
                <TimeRangeToggle currentRange={daysRange} onRangeChange={setDaysRange} />
                <SparklineChart data={sparkline} days={daysRange} />
                <MonthlyBarChart data={monthlySeries} />
                <CategoryBreakdown data={categoryBreakdown} />

                <View style={[styles.panel, { marginTop: SIZES.padding }]}>
                    <Text style={styles.panelTitle}>Quick insights</Text>
                    <Text style={styles.insightText}>- Most spent category: {categoryBreakdown[0]?.key || "—"}</Text>
                    <Text style={styles.insightText}>- Average daily (range): ${avgPerDay.toFixed(2)}</Text>
                    <TouchableOpacity style={[commonStyles.button, { marginTop: SIZES.padding }]} onPress={() => setCsvOpen(true)}>
                        <Text style={commonStyles.buttonText}>Export to CSV</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            <Modal visible={csvOpen} animationType="slide">
                 <SafeAreaView style={{ flex: 1 }}>
                     <View style={{ padding: SIZES.padding, flex: 1 }}>
                         <Text style={commonStyles.header}>CSV Export</Text>
                         <TextInput
                             value={buildCSV(expenses)}
                             multiline
                             style={styles.csvInput}
                         />
                         <TouchableOpacity style={[commonStyles.button, { marginTop: SIZES.padding }]} onPress={() => { setCsvOpen(false); Alert.alert("Copied", "CSV data copied to clipboard."); }}>
                             <Text style={commonStyles.buttonText}>Close</Text>
                         </TouchableOpacity>
                     </View>
                 </SafeAreaView>
             </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    panel: {
        ...commonStyles.container,
        backgroundColor: COLORS.white,
        borderRadius: SIZES.radius,
        padding: SIZES.padding,
        marginBottom: SIZES.padding,
    },
    panelTitle: {
        fontSize: SIZES.h3,
        fontWeight: "bold",
        marginBottom: SIZES.base,
    },
    insightText: {
        ...commonStyles.input,
        marginBottom: SIZES.base,
    },
    csvInput: {
        flex: 1,
        backgroundColor: COLORS.lightGray,
        padding: SIZES.padding,
        borderRadius: SIZES.radius,
        textAlignVertical: 'top'
    }
});
