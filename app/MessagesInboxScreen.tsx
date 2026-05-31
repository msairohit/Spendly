import AsyncStorage from "@react-native-async-storage/async-storage";
import { addDoc, collection, doc, serverTimestamp } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    PermissionsAndroid,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import SmsAndroid from "react-native-get-sms-android";
import { useAuth } from "./AuthProvider";
import { db } from "./firebase";
// NEW: navigation helpers
import { useNavigation } from "@react-navigation/native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * MessagesInboxScreen
 * - Android only: reads device SMS inbox
 * - Parses messages to detect amount/date/desc
 * - Shows Add expense / Add detailed expense / Ignore buttons
 * - "Add detailed expense" opens AddExpense screen with prefilled values
 * - Adds expense to Firestore under users/{encodedEmail}/expenses
 * - Stores ignored message signatures in AsyncStorage to avoid repeat prompts
 */

type SmsItem = {
    _id: string;
    address: string;
    body: string;
    date: number; // millis
};

type ParsedExpense = {
    amount: number;
    type: "debit" | "credit";
    date?: Date;
    description?: string;
    tags?: string[];
};

const IGNORED_KEY = "messages_ignored_v1";

export default function MessagesInboxScreen() {
    const { user, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(true);
    const [smsList, setSmsList] = useState<SmsItem[]>([]);
    const [ignored, setIgnored] = useState<Record<string, true>>({});
    const [workingId, setWorkingId] = useState<string | null>(null);
    const nav: any = useNavigation(); // try react-navigation first

    useEffect(() => {
        (async () => {
            const stored = await AsyncStorage.getItem(IGNORED_KEY);
            setIgnored(stored ? JSON.parse(stored) : {});
            setLoading(false);
        })();
    }, []);

    async function requestAndLoadSms() {
        console.log("Requesting SMS read permission...");
        if (Platform.OS !== "android") {
            console.log("SMS reading not supported on this platform");
            Alert.alert("Not supported", "Reading SMS is available only on Android.");
            return;
        }

        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
            title: "Read SMS permission",
            message: "Spendly needs permission to read SMS to detect expense messages (Android only).",
            buttonPositive: "Allow",
            buttonNegative: "Deny",
        });
        console.log("SMS read permission result:", granted);

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            console.log("SMS read permission denied");
            Alert.alert("Permission denied", "Cannot read SMS without permission.");
            return;
        }

        console.log("Loading SMS messages...");

        setLoading(true);
        // simple filter: inbox, latest 200 messages
        const filter = {
            box: "inbox",
            maxCount: 50,
        };

        SmsAndroid.list(
            JSON.stringify(filter),
            (fail: any) => {
                console.warn("SMS load failed", fail);
                Alert.alert("Error", "Failed to read SMS.");
                setLoading(false);
            },
            (count: number, smsString: string) => {
                try {
                    const arr = JSON.parse(smsString) as SmsItem[];
                    // Normalize and keep messages that look like they contain an amount or keywords
                    const candidates = arr
                        .map((s) => ({ _id: String(s._id || s.date || `${s.address}_${s.date}`), address: s.address, body: s.body || "", date: Number(s.date) || Date.now() }))
                        .filter((s) => /₹|rs\.?|inr|paid|spent|debited|credited|received|order|txn|transaction|amount/i.test(s.body))
                        .slice(0, 150);
                    setSmsList(candidates);
                } catch (e) {
                    console.warn("SMS parse error", e);
                    Alert.alert("Error", "Unable to parse SMS list.");
                } finally {
                    setLoading(false);
                }
            }
        );
    }

    useEffect(() => {
        // initial load on mount for Android
        if (Platform.OS === "android") requestAndLoadSms();
        else setLoading(false);
    }, []);

    const parsed = useMemo(() => {
        return smsList.map((s) => ({ sms: s, parsed: parseMessageToExpense({ text: s.body, receivedAt: new Date(s.date) }) }));
    }, [smsList]);

    async function addExpenseFromSms(sms: SmsItem, p: ParsedExpense | null) {
        if (!user?.email) return Alert.alert("Sign in required");
        setWorkingId(sms._id);
        try {
            const userKey = encodeURIComponent(user.email);
            const expensesRef = collection(doc(db, "users", userKey), "expenses");
            const payload: any = {
                date: p?.date ? p.date : new Date(sms.date),
                amount: p?.amount ?? 0,
                type: p?.type ?? "debit",
                description: p?.description ?? `${sms.address}: ${sms.body.slice(0, 180)}`,
                category: "Uncategorized",
                paymentMethod: null,
                tags: p?.tags ?? [],
                createdAt: serverTimestamp(),
                meta: { fromMessageId: sms._id, messageBodySnippet: sms.body.slice(0, 120) },
            };
            const docRef = await addDoc(expensesRef, payload);
            // mark as ignored/processed locally so it doesn't appear again
            const newIgnored = { ...ignored, [sms._id]: true };
            await AsyncStorage.setItem(IGNORED_KEY, JSON.stringify(newIgnored));
            setIgnored(newIgnored);
            setWorkingId(null);
            Alert.alert("Added", "Expense created from message");
        } catch (err: any) {
            console.warn(err);
            setWorkingId(null);
            Alert.alert("Error", err?.message || "Failed to add expense");
        }
    }

    // NEW: open AddExpense screen with prefilled values for detailed editing
    async function openAddDetailed(sms: SmsItem, p: ParsedExpense | null) {
        const prefill = {
            amount: p?.amount ?? 0,
            type: p?.type ?? "debit",
            date: (p?.date ?? new Date(sms.date)).toISOString(),
            description: p?.description ?? `${sms.address}: ${sms.body.slice(0, 180)}`,
            source: "sms",
            messageId: sms._id,
            tags: p?.tags ?? [],
        };

        // Mark the source message as processed locally before navigation so it won't reappear.
        try {
            const newIgnored = { ...ignored, [sms._id]: true };
            await AsyncStorage.setItem(IGNORED_KEY, JSON.stringify(newIgnored));
            setIgnored(newIgnored);
        } catch (err) {
            console.warn("Failed to mark message processed locally", err);
            // continue to navigation even if marking failed
        }

        // Try react-navigation first
        try {
            if (nav && typeof nav.navigate === "function") {
                // adjust route name if different in your app
                nav.navigate("AddExpenseScreen", { prefill });
                return;
            }
        } catch (e) {
            // ignore and fallback
        }

        // Fallback: expo-router push with encoded prefill (adjust path if needed)
        try {
            const encoded = encodeURIComponent(JSON.stringify(prefill));
            router.push(`/AddExpenseScreen?prefill=${encoded}`);
        } catch (e) {
            Alert.alert("Navigation failed", "Unable to open AddExpense screen. Check routing setup.");
        }
    }

    async function ignoreSms(sms: SmsItem) {
        const newIgnored = { ...ignored, [sms._id]: true };
        await AsyncStorage.setItem(IGNORED_KEY, JSON.stringify(newIgnored));
        setIgnored(newIgnored);
    }

    if (authLoading || loading) {
        return (
            <SafeAreaView style={styles.safe}>
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#06b6d4" />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.header}>
                <Text style={styles.title}>Device Messages</Text>
                <TouchableOpacity style={styles.refresh} onPress={() => requestAndLoadSms()}>
                    <Text style={styles.refreshText}>Refresh</Text>
                </TouchableOpacity>
            </View>

            {Platform.OS !== "android" ? (
                <View style={styles.noteBox}>
                    <Text style={styles.noteText}>Reading SMS is supported only on Android. Use the cloud inbox otherwise.</Text>
                </View>
            ) : null}

            <FlatList
                contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
                data={parsed.filter((it) => !ignored[it.sms._id])}
                keyExtractor={(it) => it.sms._id}
                ListEmptyComponent={<Text style={styles.empty}>No candidate messages</Text>}
                renderItem={({ item }) => {
                    const s = item.sms;
                    const p = item.parsed;
                    const isWorking = workingId === s._id;
                    return (
                        <View style={styles.card}>
                            <Text style={styles.address}>{s.address}</Text>
                            <Text style={styles.body} numberOfLines={4}>{s.body}</Text>
                            <Text style={styles.when}>{new Date(s.date).toLocaleString()}</Text>

                            <View style={styles.parsedRow}>
                                <View style={styles.parsedCol}>
                                    <Text style={styles.parsedLabel}>Amount</Text>
                                    <Text style={[styles.parsedValue, p?.type === "credit" ? { color: "#10b981" } : { color: "#ef4444" }]}>
                                        {p?.type === "credit" ? "+" : "-"}₹{p?.amount ? p.amount.toFixed(2) : "--"}
                                    </Text>
                                </View>
                                <View style={styles.parsedCol}>
                                    <Text style={styles.parsedLabel}>Type</Text>
                                    <Text style={styles.parsedValue}>{p?.type === "credit" ? "🟢 Credit" : "🔴 Debit"}</Text>
                                </View>
                                <View style={styles.parsedCol}>
                                    <Text style={styles.parsedLabel}>Date</Text>
                                    <Text style={styles.parsedValue}>{p?.date ? p.date.toLocaleDateString() : new Date(s.date).toLocaleDateString()}</Text>
                                </View>
                            </View>

                            <View style={styles.actionsRow}>
                                <TouchableOpacity
                                    disabled={isWorking}
                                    style={[styles.addBtn, isWorking && { opacity: 0.6 }]}
                                    onPress={() => addExpenseFromSms(s, p)}
                                >
                                    <Text style={styles.addText}>{isWorking ? "Adding…" : "Add expense"}</Text>
                                </TouchableOpacity>

                                {/* NEW: Add detailed expense */}
                                <TouchableOpacity
                                    disabled={isWorking}
                                    style={[styles.addDetailedBtn, isWorking && { opacity: 0.6 }]}
                                    onPress={() => openAddDetailed(s, p)}
                                >
                                    <Text style={styles.addDetailedText}>Add (detailed)</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    disabled={isWorking}
                                    style={[styles.ignoreBtn, isWorking && { opacity: 0.6 }]}
                                    onPress={() =>
                                        Alert.alert("Ignore", "Ignore this message so it won't be suggested again?", [
                                            { text: "Cancel", style: "cancel" },
                                            { text: "Ignore", style: "destructive", onPress: () => ignoreSms(s) },
                                        ])
                                    }
                                >
                                    <Text style={styles.ignoreText}>Ignore</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    );
                }}
            />
        </SafeAreaView>
    );
}

/* --- reuse parsing helpers (same logic as DB-based parser) --- */

function parseMessageToExpense(m: { text: string; receivedAt: Date }): ParsedExpense | null {
    const txt = m.text || "";
    const amountRegex = /(?:₹|Rs\.?|INR\s?)\s?([\d,]+(?:\.\d+)?)/i;
    const amountMatch = txt.match(amountRegex) || txt.match(/([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d+)?)(?!\S)/);
    let amount = 0;
    if (amountMatch) {
        const raw = (amountMatch[1] || amountMatch[0]).replace(/,/g, "");
        amount = parseFloat(raw) || 0;
    }

    let date: Date | undefined;
    const dmatch = txt.match(/(\b[0-3]?\d[\/\-][0-1]?\d[\/\-](?:\d{2,4})\b)/);
    if (dmatch) {
        try {
            const parts = dmatch[1].includes("/") ? dmatch[1].split("/") : dmatch[1].split("-");
            let day = parseInt(parts[0], 10);
            let month = parseInt(parts[1], 10) - 1;
            let year = parts[2].length === 2 ? 2000 + parseInt(parts[2], 10) : parseInt(parts[2], 10);
            date = new Date(year, month, day);
        } catch (e) {
            date = undefined;
        }
    }

    if (!date) {
        const txtDate = txt.match(/\b(on\s)?(\d{1,2})\s?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/i);
        if (txtDate) {
            const day = parseInt(txtDate[2], 10);
            const month = "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(txtDate[3].slice(0, 3)) / 3;
            const year = new Date().getFullYear();
            if (!Number.isNaN(month)) date = new Date(year, month, day);
        }
    }

    const isCredit = /credited|received|added|deposited|refunded/i.test(txt);
    const type = isCredit ? "credit" : "debit";

    const description = txt.slice(0, 220).replace(/\s+/g, " ").trim();

    if (!amount && !description) return null;
    return {
        amount: amount || 0,
        type,
        date: date ?? m.receivedAt,
        description: description || undefined,
        tags: guessTagsFromText(txt),
    };
}

function guessTagsFromText(txt: string): string[] {
    const tags: string[] = [];
    const lc = txt.toLowerCase();
    if (lc.includes("grocery") || lc.includes("groceries") || lc.includes("supermarket")) tags.push("grocery");
    if (lc.includes("rent")) tags.push("rent");
    if (lc.includes("uber") || lc.includes("ola") || lc.includes("taxi")) tags.push("transport");
    if (lc.includes("movie") || lc.includes("cinema")) tags.push("entertainment");
    if (lc.includes("amazon") || lc.includes("flipkart")) tags.push("shopping");
    return tags.slice(0, 4);
}

/* --- styles --- */
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#0f172a" },
    header: { padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    title: { color: "#fff", fontSize: 18, fontWeight: "900" },
    refresh: { backgroundColor: "#083344", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
    refreshText: { color: "#a7f3d0", fontWeight: "800" },
    noteBox: { backgroundColor: "#083344", margin: 12, padding: 12, borderRadius: 8 },
    noteText: { color: "#cfeeea" },

    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    empty: { color: "#9ca3af", textAlign: "center", marginTop: 50 },

    card: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 12, marginHorizontal: 12 },
    address: { color: "#374151", fontWeight: "800", marginBottom: 6 },
    body: { color: "#111827", marginBottom: 6 },
    when: { color: "#6b7280", fontSize: 12, marginBottom: 8 },

    parsedRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
    parsedCol: { flex: 1, alignItems: "flex-start" },
    parsedLabel: { color: "#6b7280", fontSize: 12 },
    parsedValue: { fontWeight: "800", color: "#0f172a" },

    actionsRow: { flexDirection: "row", marginTop: 12, justifyContent: "flex-end" },
    addBtn: { backgroundColor: "#06b6d4", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, marginLeft: 8 },
    addText: { color: "#fff", fontWeight: "800" },

    // NEW styles for detailed-add button
    addDetailedBtn: { backgroundColor: "#0ea5a4", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, marginLeft: 8 },
    addDetailedText: { color: "#fff", fontWeight: "800" },

    ignoreBtn: { backgroundColor: "#f3f4f6", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, marginLeft: 8 },
    ignoreText: { color: "#374151", fontWeight: "800" },
});