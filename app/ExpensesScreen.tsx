import { router } from "expo-router";
import {
    collection,
    doc,
    onSnapshot,
    orderBy,
    query,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    SectionList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { useAuth } from "./AuthProvider";
import { db } from "./firebase";

/**
 * ExpensesScreen (updated)
 * - Clicking an item opens a detail popup
 * - Calendar view: change month/year, click a date to go to that day's view
 * - Weekly/monthly views show human friendly date ranges
 */

type Expense = {
    id: string;
    date: Date;
    description: string;
    amount: number;
    category?: string;
    paymentMethod?: string | null;
    tags?: string[];
    photoUri?: string | null;
    createdAt?: any;
};

const VIEW_MODES = ["timeline", "datewise", "monthly", "weekly", "calendar"] as const;
type ViewMode = typeof VIEW_MODES[number];

function startOfWeek(d: Date) {
    // ISO-like week (Mon start)
    const date = new Date(d);
    const day = (date.getDay() + 6) % 7; // 0 = Monday
    date.setDate(date.getDate() - day);
    date.setHours(0, 0, 0, 0);
    return date;
}
function endOfWeek(d: Date) {
    const s = startOfWeek(d);
    const e = new Date(s);
    e.setDate(s.getDate() + 6);
    e.setHours(23, 59, 59, 999);
    return e;
}
function startOfMonth(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfMonth(d: Date) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function formatShortDate(d: Date) {
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
function monthLabel(d: Date) {
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function ExpensesScreen() {
    const { user, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(true);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [viewMode, setViewMode] = useState<ViewMode>("timeline");
    const [filterOpen, setFilterOpen] = useState(false);
    const [filters, setFilters] = useState({
        category: "",
        paymentMethod: "",
        tag: "",
        from: "",
        to: "",
        search: "",
    });

    // detail modal
    const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

    // calendar state
    const today = new Date();
    const [calYear, setCalYear] = useState(today.getFullYear());
    const [calMonth, setCalMonth] = useState(today.getMonth()); // 0-11

    // subscribe to user's expenses collection
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
                        category: data.category,
                        paymentMethod: data.paymentMethod,
                        tags: data.tags || [],
                        photoUri: data.photoUri || null,
                        createdAt: data.createdAt,
                    } as Expense;
                });
                setExpenses(list);
                setLoading(false);
            },
            (err) => {
                console.warn("expenses snapshot error", err);
                setLoading(false);
            }
        );
        return unsub;
    }, [user?.email]);

    // derived filtered list
    const filtered = useMemo(() => {
        const f = filters;
        return expenses.filter((e) => {
            if (f.category && e.category !== f.category) return false;
            if (f.paymentMethod && e.paymentMethod !== f.paymentMethod) return false;
            if (f.tag && !(e.tags || []).includes(f.tag)) return false;
            if (f.search) {
                const s = f.search.toLowerCase();
                if (!`${e.description} ${e.category} ${e.tags?.join(" ")}`.toLowerCase().includes(s)) return false;
            }
            if (f.from) {
                const fromDate = new Date(f.from);
                if (isFinite(fromDate.getTime()) && e.date < fromDate) return false;
            }
            if (f.to) {
                const toDate = new Date(f.to);
                if (isFinite(toDate.getTime()) && e.date > new Date(toDate.getTime() + 24 * 3600 * 1000 - 1)) return false;
            }
            return true;
        });
    }, [expenses, filters]);

    // grouped by day for timeline
    const sections = useMemo(() => {
        const map = new Map<string, Expense[]>();
        filtered.forEach((e) => {
            const key = e.date.toDateString();
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(e);
        });
        const arr = Array.from(map.entries())
            .map(([title, data]) => ({ title, data: data.sort((a, b) => b.date.getTime() - a.date.getTime()) }))
            .sort((a, b) => new Date(b.title).getTime() - new Date(a.title).getTime());
        return arr;
    }, [filtered]);

    // monthly aggregates (with nice label)
    const monthly = useMemo(() => {
        const agg = new Map<string, { total: number; count: number; monthDate: Date }>();
        filtered.forEach((e) => {
            const key = `${e.date.getFullYear()}-${String(e.date.getMonth()).padStart(2, "0")}`; // use month index
            const cur = agg.get(key) || { total: 0, count: 0, monthDate: new Date(e.date.getFullYear(), e.date.getMonth(), 1) };
            cur.total += e.amount;
            cur.count += 1;
            agg.set(key, cur);
        });
        return Array.from(agg.entries())
            .map(([k, v]) => ({ key: k, ...v }))
            .sort((a, b) => (a.monthDate < b.monthDate ? 1 : -1));
    }, [filtered]);

    // weekly aggregates (start/end dates)
    const weekly = useMemo(() => {
        const agg = new Map<string, { total: number; count: number; start: Date; end: Date }>();
        filtered.forEach((e) => {
            const s = startOfWeek(e.date);
            const key = s.toISOString().slice(0, 10);
            const cur = agg.get(key) || { total: 0, count: 0, start: new Date(s), end: endOfWeek(s) };
            cur.total += e.amount;
            cur.count += 1;
            agg.set(key, cur);
        });
        return Array.from(agg.entries())
            .map(([k, v]) => ({ key: k, ...v }))
            .sort((a, b) => (a.start < b.start ? 1 : -1));
    }, [filtered]);

    function clearFilters() {
        setFilters({ category: "", paymentMethod: "", tag: "", from: "", to: "", search: "" });
    }

    if (authLoading || loading) {
        return (
            <SafeAreaView style={[styles.safe, styles.center]}>
                <ActivityIndicator size="large" color="#06b6d4" />
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

    // calendar helpers
    function prevMonth() {
        let m = calMonth - 1;
        let y = calYear;
        if (m < 0) {
            m = 11;
            y -= 1;
        }
        setCalMonth(m);
        setCalYear(y);
    }
    function nextMonth() {
        let m = calMonth + 1;
        let y = calYear;
        if (m > 11) {
            m = 0;
            y += 1;
        }
        setCalMonth(m);
        setCalYear(y);
    }
    function onCalendarDatePress(day: number) {
        const dt = new Date(calYear, calMonth, day);
        // Build a local YYYY-MM-DD string (avoid toISOString timezone shift)
        const yyyy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, "0");
        const dd = String(dt.getDate()).padStart(2, "0");
        const localDate = `${yyyy}-${mm}-${dd}`;
        setFilters((s) => ({ ...s, from: localDate, to: localDate }));
        setViewMode("datewise");
    }

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.header}>
                <Text style={styles.title}>Expenses</Text>
                <View style={styles.headerRight}>
                    <Text style={styles.emailSmall}>{user.email}</Text>
                    <TouchableOpacity style={styles.pill} onPress={() => setFilterOpen(true)}>
                        <Text style={styles.pillText}>⚙️ Filters</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.viewModeRow}>
                {VIEW_MODES.map((m) => (
                    <TouchableOpacity
                        key={m}
                        onPress={() => setViewMode(m)}
                        style={[styles.modeBtn, viewMode === m && styles.modeBtnActive]}
                    >
                        <Text style={[styles.modeText, viewMode === m && styles.modeTextActive]}>{m.toUpperCase()}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={styles.content}>
                {viewMode === "timeline" && (
                    <SectionList
                        sections={sections}
                        keyExtractor={(item) => item.id}
                        renderSectionHeader={({ section: { title } }) => (
                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionHeaderText}>{title}</Text>
                            </View>
                        )}
                        renderItem={({ item }) => (
                            <TouchableOpacity onPress={() => setSelectedExpense(item)}>
                                <View style={styles.rowCard}>
                                    <View style={styles.rowLeft}>
                                        <Text style={styles.amount}>₹{item.amount.toFixed(2)}</Text>
                                        <Text style={styles.small}>{item.category}</Text>
                                    </View>
                                    <View style={styles.rowRight}>
                                        <Text style={styles.desc}>{item.description}</Text>
                                        <Text style={styles.muted}>
                                            {item.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} • {item.tags?.join(", ")}
                                        </Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        )}
                        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                        contentContainerStyle={{ paddingBottom: 80 }}
                    />
                )}

                {viewMode === "datewise" && (
                    <FlatList
                        data={[...filtered].sort((a, b) => b.date.getTime() - a.date.getTime())}
                        keyExtractor={(i) => i.id}
                        renderItem={({ item }) => (
                            <TouchableOpacity onPress={() => setSelectedExpense(item)}>
                                <View style={styles.rowCard}>
                                    <View style={styles.rowLeft}>
                                        <Text style={styles.amount}>₹{item.amount.toFixed(2)}</Text>
                                        <Text style={styles.small}>{item.date.toDateString()}</Text>
                                    </View>
                                    <View style={styles.rowRight}>
                                        <Text style={styles.desc}>{item.description}</Text>
                                        <Text style={styles.muted}>{item.category} • {item.tags?.join(", ")}</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        )}
                        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                        contentContainerStyle={{ paddingBottom: 80 }}
                    />
                )}

                {viewMode === "monthly" && (
                    <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
                        {monthly.map((m) => {
                            const start = startOfMonth(m.monthDate);
                            const end = endOfMonth(m.monthDate);
                            return (
                                <View key={m.key} style={styles.aggregateCard}>
                                    <Text style={styles.aggregateTitle}>{monthLabel(m.monthDate)}</Text>
                                    <Text style={styles.aggregateRange}>{formatShortDate(start)} - {formatShortDate(end)}</Text>
                                    <Text style={styles.aggregateAmount}>₹{m.total.toFixed(2)}</Text>
                                    <Text style={styles.muted}>{m.count} items</Text>
                                </View>
                            );
                        })}
                        {monthly.length === 0 && <Text style={styles.emptyText}>No data for monthly view</Text>}
                    </ScrollView>
                )}

                {viewMode === "weekly" && (
                    <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
                        {weekly.map((w) => (
                            <View key={w.key} style={styles.aggregateCard}>
                                <Text style={styles.aggregateTitle}>{formatShortDate(w.start)} — {formatShortDate(w.end)}</Text>
                                <Text style={styles.aggregateAmount}>₹{w.total.toFixed(2)}</Text>
                                <Text style={styles.muted}>{w.count} items</Text>
                            </View>
                        ))}
                        {weekly.length === 0 && <Text style={styles.emptyText}>No data for weekly view</Text>}
                    </ScrollView>
                )}

                {viewMode === "calendar" && (
                    <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
                        <View style={styles.calendarHeader}>
                            <TouchableOpacity onPress={prevMonth} style={styles.navBtn}><Text style={styles.navText}>◀</Text></TouchableOpacity>
                            <Text style={styles.calendarTitle}>{monthLabel(new Date(calYear, calMonth, 1))}</Text>
                            <TouchableOpacity onPress={nextMonth} style={styles.navBtn}><Text style={styles.navText}>▶</Text></TouchableOpacity>
                        </View>
                        <Text style={styles.hint}>Tap a date to view that day's expenses</Text>
                        {renderCalendarGrid(calYear, calMonth, filtered)}
                    </ScrollView>
                )}
            </View>

            <Modal visible={filterOpen} animationType="slide" transparent>
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Filters</Text>

                        <TextInput placeholder="Search description/tags..." style={styles.input} value={filters.search} onChangeText={(t) => setFilters((s) => ({ ...s, search: t }))} />
                        <TextInput placeholder="Category (exact)" style={styles.input} value={filters.category} onChangeText={(t) => setFilters((s) => ({ ...s, category: t }))} />
                        <TextInput placeholder="Payment method" style={styles.input} value={filters.paymentMethod} onChangeText={(t) => setFilters((s) => ({ ...s, paymentMethod: t }))} />
                        <TextInput placeholder="Tag (single)" style={styles.input} value={filters.tag} onChangeText={(t) => setFilters((s) => ({ ...s, tag: t }))} />
                        <TextInput placeholder="From (YYYY-MM-DD)" style={styles.input} value={filters.from} onChangeText={(t) => setFilters((s) => ({ ...s, from: t }))} />
                        <TextInput placeholder="To (YYYY-MM-DD)" style={styles.input} value={filters.to} onChangeText={(t) => setFilters((s) => ({ ...s, to: t }))} />

                        <View style={{ flexDirection: "row", marginTop: 12 }}>
                            <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={() => setFilterOpen(false)}>
                                <Text style={styles.primaryBtnText}>Apply</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.secondaryBtn, { marginLeft: 8 }]} onPress={() => { clearFilters(); }}>
                                <Text style={styles.secondaryBtnText}>Clear</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* expense detail modal */}
            <Modal visible={!!selectedExpense} transparent animationType="slide">
                <View style={styles.modalBackdrop}>
                    <View style={styles.detailCard}>
                        <Text style={styles.modalTitle}>Expense details</Text>
                        {selectedExpense && (
                            <>
                                <Text style={styles.detailAmount}>₹{selectedExpense.amount.toFixed(2)}</Text>
                                <Text style={styles.detailWhen}>{selectedExpense.date.toLocaleString()}</Text>
                                <Text style={styles.detailLabel}>Description</Text>
                                <Text style={styles.detailText}>{selectedExpense.description}</Text>

                                <View style={{ flexDirection: "row", marginTop: 8 }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.detailLabel}>Category</Text>
                                        <Text style={styles.detailText}>{selectedExpense.category || "—"}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.detailLabel}>Payment</Text>
                                        <Text style={styles.detailText}>{selectedExpense.paymentMethod || "—"}</Text>
                                    </View>
                                </View>

                                <Text style={[styles.detailLabel, { marginTop: 8 }]}>Tags</Text>
                                <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
                                    {(selectedExpense.tags || []).map((t) => (
                                        <View key={t} style={styles.tagChip}><Text style={styles.tagText}>{t}</Text></View>
                                    ))}
                                </View>

                                {selectedExpense.photoUri ? (
                                    <Image source={{ uri: selectedExpense.photoUri }} style={styles.detailImage} />
                                ) : null}

                                <TouchableOpacity style={[styles.primaryBtn, { marginTop: 12 }]} onPress={() => setSelectedExpense(null)}>
                                    <Text style={styles.primaryBtnText}>Close</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );

    // render calendar grid for given month/year
    function renderCalendarGrid(year: number, month: number, list: Expense[]) {
        const first = new Date(year, month, 1);
        const startDay = (first.getDay() + 6) % 7; // Monday = 0
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // aggregate totals for month
        const totals: Record<number, number> = {};
        list.forEach((e) => {
            if (e.date.getFullYear() === year && e.date.getMonth() === month) {
                const d = e.date.getDate();
                totals[d] = (totals[d] || 0) + e.amount;
            }
        });

        const cells: React.ReactNode[] = [];

        // leading blanks
        for (let i = 0; i < startDay; i++) {
            cells.push(
                <View key={`b${i}`} style={styles.calendarCellEmpty} />
            );
        }

        // days
        for (let d = 1; d <= daysInMonth; d++) {
            const total = totals[d];
            cells.push(
                <TouchableOpacity key={d} style={styles.calendarCellTouchable} onPress={() => onCalendarDatePress(d)} activeOpacity={0.8}>
                    <View style={styles.calendarCell}>
                        <Text style={styles.calendarDate}>{d}</Text>
                        <Text style={styles.calendarAmount}>{total ? `₹${total.toFixed(0)}` : ""}</Text>
                    </View>
                </TouchableOpacity>
            );
        }

        // trailing blanks to fill last week
        while (cells.length % 7 !== 0) {
            cells.push(<View key={`t${cells.length}`} style={styles.calendarCellEmpty} />);
        }

        // group into rows of 7
        const rows: React.ReactNode[] = [];
        for (let i = 0; i < cells.length; i += 7) {
            rows.push(
                <View key={`r${i}`} style={styles.calendarRow}>
                    {cells.slice(i, i + 7)}
                </View>
            );
        }

        return <View style={{ padding: 8 }}>{rows}</View>;
    }
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
    title: { color: "#fff", fontSize: 22, fontWeight: "800" },
    headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    emailSmall: { color: "#9ca3af", marginRight: 8 },
    pill: {
        backgroundColor: "#083344",
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 999,
    },
    pillText: { color: "#a7f3d0", fontWeight: "700" },

    viewModeRow: {
        flexDirection: "row",
        padding: 12,
        backgroundColor: "#06202a",
        justifyContent: "space-between",
    },
    modeBtn: {
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: "#04202a",
    },
    modeBtnActive: { backgroundColor: "#06b6d4" },
    modeText: { color: "#9ca3af", fontWeight: "700", fontSize: 12 },
    modeTextActive: { color: "#06202a" },

    content: {
        flex: 1,
        backgroundColor: "#f7fbff",
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        marginTop: -6,
        padding: 12,
    },

    sectionHeader: {
        backgroundColor: "transparent",
        paddingVertical: 8,
    },
    sectionHeaderText: { fontWeight: "800", color: "#111827" },

    rowCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        elevation: 2,
        shadowColor: "#000",
        shadowOpacity: 0.06,
        marginBottom: 6,
    },
    rowLeft: { width: 110, alignItems: "flex-start", marginRight: 12 },
    rowRight: { flex: 1 },
    amount: { fontSize: 18, fontWeight: "900", color: "#0f172a" },
    desc: { fontWeight: "700", color: "#0f172a" },
    small: { color: "#6b7280", fontSize: 12 },
    muted: { color: "#6b7280", fontSize: 12, marginTop: 4 },

    aggregateCard: {
        backgroundColor: "#fff",
        padding: 16,
        borderRadius: 12,
        marginBottom: 10,
    },
    aggregateTitle: { fontWeight: "800" },
    aggregateRange: { color: "#6b7280", marginTop: 4 },
    aggregateAmount: { fontSize: 18, fontWeight: "900", color: "#059669", marginTop: 6 },

    emptyText: { textAlign: "center", color: "#6b7280", padding: 24 },

    modalBackdrop: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(0,0,0,0.45)",
    },
    modalCard: {
        backgroundColor: "#fff",
        padding: 16,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
    },
    modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 12 },
    input: { backgroundColor: "#f3f4f6", padding: 10, borderRadius: 10, marginBottom: 8 },

    primaryBtn: {
        backgroundColor: "#06b6d4",
        padding: 12,
        borderRadius: 10,
        alignItems: "center",
    },
    primaryBtnText: { color: "#fff", fontWeight: "800" },
    secondaryBtn: {
        backgroundColor: "#fff",
        borderColor: "#e5e7eb",
        borderWidth: 1,
        padding: 12,
        borderRadius: 10,
        alignItems: "center",
    },
    secondaryBtnText: { color: "#374151", fontWeight: "700" },

    calendarHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, marginBottom: 8 },
    navBtn: { padding: 8 },
    navText: { color: "#0f172a", fontWeight: "800" },
    calendarTitle: { color: "#0f172a", fontWeight: "800", fontSize: 16 },
    hint: { color: "#6b7280", textAlign: "center", marginVertical: 10 },

    // row contains 7 flexible cells
    calendarRow: {
        flexDirection: "row",
        marginBottom: 8,
    },

    // each visible cell: flexible, has margin and minimum height so content is visible
    calendarCell: {
        flex: 1,
        backgroundColor: "#fff",
        paddingVertical: 10,
        paddingHorizontal: 6,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        minHeight: 72,
        marginHorizontal: 4,
        elevation: 2,
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 6,
    },
    calendarCellTouchable: {
        flex: 1,
        marginHorizontal: 4,
    },
    calendarCellEmpty: {
        flex: 1,
        marginHorizontal: 4,
        minHeight: 72,
        // keep background transparent so it looks empty, but reserves space
    },
    calendarDate: { fontWeight: "800", color: "#0f172a", fontSize: 14 },
    calendarAmount: { color: "#059669", marginTop: 6, fontSize: 12 },

    // detail modal
    detailCard: {
        backgroundColor: "#fff",
        padding: 16,
        margin: 18,
        borderRadius: 12,
    },
    detailAmount: { fontSize: 22, fontWeight: "900", color: "#0f172a", marginTop: 4 },
    detailWhen: { color: "#6b7280", marginTop: 4 },
    detailLabel: { marginTop: 10, color: "#6b7280", fontWeight: "700" },
    detailText: { fontWeight: "700", color: "#0f172a", marginTop: 4 },
    detailImage: { width: "100%", height: 160, marginTop: 10, borderRadius: 10 },

    tagChip: { backgroundColor: "#f3f4f6", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 16, marginRight: 6, marginBottom: 6 },
    tagText: { color: "#374151", fontWeight: "700" },

    primaryBtnTextSmall: { color: "#fff" },

    emptyTitle: { color: "#fff", fontWeight: "800" },
});