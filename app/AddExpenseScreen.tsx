/**
 * AddExpenseScreen.tsx
 *
 * Notes:
 * - This implementation uses minimal external deps. For better native pickers and image support,
 *   consider installing:
 *     - @react-native-community/datetimepicker
 *     - expo-image-picker (if using Expo) or react-native-image-picker
 *
 * - If you don't have those, the UI will still work; replace pickImage / native pickers with your preferred implementations.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
    Animated,
    Image,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";

import DateTimePicker from "@react-native-community/datetimepicker"; // optional but recommended
import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useAuth } from "./AuthProvider";
import { db } from "./firebase";
// import * as ImagePicker from 'expo-image-picker'; // optional (Expo)
// Use emojis as icons so no extra vector-icon dependency is required.

// NEW: navigation helper to go back after save
import { router } from "expo-router";
// NEW imports for navigation / prefill support
import { useRoute } from "@react-navigation/native";
import { useSearchParams } from "expo-router";

const CATEGORIES = ["Food", "Transport", "Rent", "Entertainment", "Bills", "Health", "Other"];
const PAYMENT_METHODS = ["Cash", "Card", "UPI", "Bank Transfer", "Wallet"];
const TAGS = [
    "grocery",
    "rent",
    "needed",
    "single time",
    "can reduce",
    "need to eliminate",
    "work",
    "personal",
];

export default function AddExpenseScreen() {
    const { user } = useAuth();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [date, setDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);

    const [description, setDescription] = useState("");
    const [amount, setAmount] = useState("");
    const [category, setCategory] = useState<string | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [photoUri, setPhotoUri] = useState<string | null>(null);

    const [extrasOpen, setExtrasOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    const headerScale = useMemo(() => new Animated.Value(1), []);

    // --- NEW: read prefill from navigation params (react-navigation) or expo-router query param ---
    const route: any = useRoute?.() ?? {};
    const searchParams = useSearchParams?.() ?? {};
    const prefillQuery = (searchParams as any).prefill as string | undefined;

    useEffect(() => {
        let mounted = true;

        async function resolveStringPrefill(raw: string) {
            // try JSON.parse, decodeURIComponent + parse, up to a couple of attempts
            let s = String(raw);
            for (let i = 0; i < 3; i++) {
                try {
                    return JSON.parse(s);
                } catch (e) {
                    try { s = decodeURIComponent(s); } catch { break; }
                }
            }
            // final attempt
            try { return JSON.parse(raw); } catch { return null; }
        }

        (async () => {
            try {
                const navPrefill = route?.params?.prefill;
                let rawPrefill: any = null;
                if (navPrefill) rawPrefill = navPrefill;
                else if (prefillQuery) rawPrefill = await resolveStringPrefill(prefillQuery);

                if (!rawPrefill) return;

                // If prefill is object already, use it; if string, we already decoded above.
                const prefill = typeof rawPrefill === "object" ? rawPrefill : rawPrefill;

                // If editing by id, always attempt to fetch latest doc and merge with prefill
                if (prefill?.id && user?.email) {
                    try {
                        const userKey = encodeURIComponent(user.email);
                        const expRef = doc(db, "users", userKey, "expenses", String(prefill.id));
                        const snap = await getDoc(expRef);
                        if (snap.exists()) {
                            const data: any = snap.data();
                            // merge doc data with prefill (prefill overrides doc)
                            const merged = { ...data, ...prefill };

                            if (!mounted) return;
                            setEditingId(String(prefill.id));
                            if (typeof merged.amount !== "undefined") setAmount(String(merged.amount));
                            if (merged.date) {
                                const d = typeof merged.date === "string" ? new Date(merged.date) : (merged.date?.toDate ? merged.date.toDate() : new Date(merged.date));
                                if (!isNaN(d.getTime())) setDate(d);
                            }
                            if (merged.description) setDescription(String(merged.description));
                            if (Array.isArray(merged.tags)) setSelectedTags(merged.tags);
                            if (merged.category) setCategory(merged.category);
                            if (merged.paymentMethod) setPaymentMethod(merged.paymentMethod);
                            if (merged.photoUri) setPhotoUri(merged.photoUri);
                            setExtrasOpen(true);
                            return;
                        }
                    } catch (e) {
                        console.warn("Failed to load expense doc for editing", e);
                        // fallthrough to apply any available prefill fields below
                    }
                }

                // Apply simple prefill if no id/doc or fetch failed
                if (prefill?.id && mounted) setEditingId(String(prefill.id));
                if (typeof prefill?.amount !== "undefined" && prefill?.amount !== null && mounted) setAmount(String(prefill.amount));
                if (prefill?.date && mounted) {
                    const d = new Date(prefill.date);
                    if (!isNaN(d.getTime())) setDate(d);
                }
                if (prefill?.description && mounted) setDescription(String(prefill.description));
                if (Array.isArray(prefill?.tags) && mounted) setSelectedTags(prefill.tags);
                if (prefill?.category && mounted) setCategory(prefill.category);
                if (prefill?.paymentMethod && mounted) setPaymentMethod(prefill.paymentMethod);
                if (prefill?.photoUri && mounted) setPhotoUri(prefill.photoUri);
                if (mounted) setExtrasOpen(true);
            } catch (err) {
                console.warn("prefill parse/load error", err);
            }
        })();

        return () => { mounted = false; };
    }, [route?.params?.prefill, prefillQuery, user?.email]);

    function toggleExtras() {
        setExtrasOpen((s) => !s);
        Animated.sequence([
            Animated.timing(headerScale, { toValue: 0.98, duration: 120, useNativeDriver: true }),
            Animated.timing(headerScale, { toValue: 1, duration: 120, useNativeDriver: true }),
        ]).start();
    }

    function onChangeDate(event: any, selected?: Date) {
        setShowDatePicker(false);
        if (selected) setDate((prev) => {
            // Keep the previous time if only date was changed
            const next = new Date(selected);
            next.setHours(prev.getHours(), prev.getMinutes());
            return next;
        });
    }

    function onChangeTime(event: any, selected?: Date) {
        setShowTimePicker(false);
        if (selected) {
            const d = new Date(date);
            d.setHours(selected.getHours(), selected.getMinutes());
            setDate(d);
        }
    }

    function toggleTag(tag: string) {
        setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
    }

    async function pickImage() {
        // Placeholder: implement with expo-image-picker or react-native-image-picker.
        // Example with expo-image-picker:
        // const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
        // if (!result.cancelled) setPhotoUri(result.uri);
        // For now leave as-is.
        alert("Implement pickImage using expo-image-picker or react-native-image-picker in your project.");
    }

    async function submitExpense() {
        // Validate minimal fields
        if (!description.trim() || !amount.trim()) {
            alert("Please enter description and amount.");
            return;
        }
        if (!user?.email) {
            alert("You must be signed in to save expenses.");
            return;
        }

        const expense = {
            date: date.toISOString(),
            description,
            amount: parseFloat(amount),
            category: category || "Uncategorized",
            paymentMethod: paymentMethod || null,
            tags: selectedTags,
            photoUri,
            // createdAt only when creating new doc; updatedAt also set for updates
            createdAt: editingId ? undefined : serverTimestamp(),
            updatedAt: serverTimestamp(),
        };

        try {
            setSaving(true);
            // encode email to a safe doc id
            const userKey = encodeURIComponent(user.email);
            const userDocRef = doc(db, "users", userKey);
            const expensesColRef = collection(userDocRef, "expenses");
            let savedId: string | null = null;
            if (editingId) {
                // update existing expense
                const expRef = doc(db, "users", userKey, "expenses", editingId);
                // remove undefined createdAt so update doesn't clear it
                const { createdAt: _c, ...updatePayload } = expense as any;
                await updateDoc(expRef, updatePayload);
                savedId = editingId;
            } else {
                const docRef = await addDoc(expensesColRef, expense);
                savedId = docRef.id;
            }

            // If this screen was opened from a message (prefill.messageId), mark that message as processed in Firestore
            try {
                const prefillParam = route?.params?.prefill ?? (prefillQuery ? JSON.parse(decodeURIComponent(prefillQuery)) : null);
                const messageId = prefillParam?.messageId;
                if (messageId) {
                    const msgRef = doc(db, "users", userKey, "messages", String(messageId));
                    await updateDoc(msgRef, { processed: true, status: "added", expenseId: savedId });
                }
            } catch (msgErr) {
                // non-fatal
                console.warn("mark message as processed error", msgErr);
            }

            alert("Expense saved.");
            // reset
            setDescription("");
            setAmount("");
            setCategory(null);
            setPaymentMethod(null);
            setSelectedTags([]);
            setPhotoUri(null);
            setDate(new Date());
            setExtrasOpen(false);
            // go back to previous screen
            router.back();
        } catch (err: any) {
            console.error("Save expense failed", err);
            alert(err?.message || "Failed to save expense");
        } finally {
            setSaving(false);
        }
    }

    const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    })}`;

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Animated.View style={[styles.header, { transform: [{ scale: headerScale }] }]}>
                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setShowDatePicker(true)}
                    style={styles.dateButton}
                >
                    <Text style={styles.dateEmoji}>📅</Text>
                    <View style={styles.dateTextWrap}>
                        <Text style={styles.dateLabel}>Date & Time</Text>
                        <Text style={styles.dateText}>{formattedDate}</Text>
                    </View>
                </TouchableOpacity>

                <View style={styles.iconRow}>
                    <View style={styles.roundIcon}>
                        <Text style={styles.iconEmoji}>💸</Text>
                    </View>
                </View>
            </Animated.View>

            {/* Prefill notice */}
            {(route?.params?.prefill || prefillQuery) ? (
                <View style={styles.prefillBanner}>
                    <Text style={styles.prefillText}>Edit Expense!</Text>
                    <Text style={styles.prefillText}>Prefilled data, edit fields before saving</Text>
                </View>
            ) : null}

            <View style={styles.card}>
                <Text style={styles.sectionTitle}>Primary Details</Text>

                <View style={styles.row}>
                    <TextInput
                        placeholder="Description (e.g., Lunch at cafe)"
                        style={[styles.input, styles.flexTwo]}
                        value={description}
                        onChangeText={setDescription}
                        multiline={true}
                    />
                    <TextInput
                        placeholder="Amount💵"
                        keyboardType="numeric"
                        style={[styles.input, styles.amountInput]}
                        value={amount}
                        onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
                    />
                </View>

                <TouchableOpacity style={styles.extrasToggle} onPress={toggleExtras}>
                    <Text style={styles.extrasToggleText}>{extrasOpen ? "Hide extras ▲" : "Show extras ▼"}</Text>
                </TouchableOpacity>

                {extrasOpen && (
                    <View style={styles.extrasWrap}>
                        <Text style={styles.fieldLabel}>Category</Text>
                        <View style={styles.pickerRow}>
                            {CATEGORIES.map((c) => {
                                const active = c === category;
                                return (
                                    <Pressable
                                        key={c}
                                        onPress={() => setCategory(c)}
                                        style={[styles.pickerChip, active && styles.pickerChipActive]}
                                    >
                                        <Text style={[styles.pickerChipText, active && styles.pickerChipTextActive]}>
                                            {c}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        <Text style={styles.fieldLabel}>Payment Method</Text>
                        <View style={styles.pickerRow}>
                            {PAYMENT_METHODS.map((p) => {
                                const active = p === paymentMethod;
                                return (
                                    <Pressable
                                        key={p}
                                        onPress={() => setPaymentMethod(p)}
                                        style={[styles.pickerChip, active && styles.pickerChipActive]}
                                    >
                                        <Text style={[styles.pickerChipText, active && styles.pickerChipTextActive]}>
                                            {p}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        <Text style={styles.fieldLabel}>Tags</Text>
                        <View style={styles.tagsRow}>
                            {TAGS.map((t) => {
                                const active = selectedTags.includes(t);
                                return (
                                    <Pressable
                                        key={t}
                                        onPress={() => toggleTag(t)}
                                        style={[styles.tagChip, active && styles.tagChipActive]}
                                    >
                                        <Text style={[styles.tagText, active && styles.tagTextActive]}>{t}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        <Text style={styles.fieldLabel}>Photo</Text>
                        <View style={styles.photoRow}>
                            <TouchableOpacity style={styles.photoBox} onPress={pickImage}>
                                {photoUri ? (
                                    <Image source={{ uri: photoUri }} style={styles.photo} />
                                ) : (
                                    <Text style={styles.photoPlaceholder}>📷 Add photo</Text>
                                )}
                            </TouchableOpacity>

                            <View style={styles.metaColumn}>
                                <Text style={styles.hintText}>Attach receipt or quick photo</Text>
                                <Text style={styles.hintSub}>
                                    Photos can help with proof and later OCR (if integrated)
                                </Text>
                            </View>
                        </View>
                    </View>
                )}

                <TouchableOpacity style={[styles.addButton, saving && { opacity: 0.7 }]} onPress={submitExpense} disabled={saving}>
                    <Text style={styles.addButtonText}>{saving ? "Saving..." : ((route?.params?.prefill || prefillQuery) ? "Edit Expense" : "➕ Add Expense")}</Text>
                </TouchableOpacity>
            </View>

            {showDatePicker && (
                <DateTimePicker
                    value={date}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={onChangeDate}
                />
            )}
            {showTimePicker && (
                <DateTimePicker
                    value={date}
                    mode="time"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={onChangeTime}
                />
            )}

            {/* Quick-time button row */}
            <View style={styles.quickRow}>
                <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.quickBtn}>
                    <Text style={styles.quickText}>Change Date</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowTimePicker(true)} style={styles.quickBtn}>
                    <Text style={styles.quickText}>Change Time</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 18,
        backgroundColor: "#f7f9fc",
        minHeight: "100%",
    },
    header: {
        alignItems: "center",
        marginBottom: 12,
        flexDirection: "row",
        justifyContent: "space-between",
    },
    dateButton: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#ffffff",
        padding: 12,
        borderRadius: 14,
        elevation: 2,
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 8,
        flex: 1,
        marginRight: 12,
    },
    dateEmoji: {
        fontSize: 28,
        marginRight: 10,
    },
    dateTextWrap: {
        flex: 1,
    },
    dateLabel: {
        color: "#6b7280",
        fontSize: 12,
    },
    dateText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#111827",
    },
    iconRow: {
        width: 52,
        height: 52,
        borderRadius: 14,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        elevation: 2,
    },
    roundIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: "#ffefcc",
        alignItems: "center",
        justifyContent: "center",
    },
    iconEmoji: {
        fontSize: 20,
    },
    card: {
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 16,
        elevation: 3,
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 10,
    },
    sectionTitle: {
        fontSize: 14,
        color: "#374151",
        marginBottom: 8,
        fontWeight: "600",
    },
    row: {
        flexDirection: "row",
        gap: 10,
        alignItems: "center",
    },
    input: {
        backgroundColor: "#f3f4f6",
        padding: 12,
        borderRadius: 12,
        marginBottom: 10,
    },
    flexTwo: {
        flex: 2,
        marginRight: 8,
    },
    amountInput: {
        width: 110,
        textAlign: "right",
    },
    extrasToggle: {
        marginVertical: 6,
    },
    extrasToggleText: {
        color: "#2563eb",
        fontWeight: "600",
    },
    extrasWrap: {
        marginTop: 6,
    },
    fieldLabel: {
        marginTop: 10,
        marginBottom: 6,
        color: "#4b5563",
        fontWeight: "600",
    },
    pickerRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    pickerChip: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: "#eef2ff",
        marginRight: 8,
        marginBottom: 8,
    },
    pickerChipActive: {
        backgroundColor: "#c7d2fe",
    },
    pickerChipText: {
        color: "#3730a3",
        fontWeight: "600",
    },
    pickerChipTextActive: {
        color: "#1e3a8a",
    },
    tagsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
    },
    tagChip: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 20,
        backgroundColor: "#f3f4f6",
        marginRight: 8,
        marginBottom: 8,
    },
    tagChipActive: {
        backgroundColor: "#fde68a",
    },
    tagText: {
        color: "#374151",
    },
    tagTextActive: {
        color: "#92400e",
        fontWeight: "700",
    },
    photoRow: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 6,
    },
    photoBox: {
        width: 86,
        height: 86,
        borderRadius: 12,
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#e5e7eb",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 12,
    },
    photo: {
        width: "100%",
        height: "100%",
        borderRadius: 12,
    },
    photoPlaceholder: {
        color: "#9ca3af",
        textAlign: "center",
    },
    metaColumn: {
        flex: 1,
    },
    hintText: {
        color: "#6b7280",
        fontWeight: "600",
    },
    hintSub: {
        color: "#9ca3af",
        fontSize: 12,
        marginTop: 4,
    },
    addButton: {
        marginTop: 14,
        backgroundColor: "#10b981",
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: "center",
    },
    addButtonText: {
        color: "#fff",
        fontWeight: "800",
        fontSize: 16,
    },
    quickRow: {
        marginTop: 14,
        flexDirection: "row",
        justifyContent: "space-between",
    },
    quickBtn: {
        backgroundColor: "#fff",
        padding: 10,
        borderRadius: 10,
        flex: 1,
        alignItems: "center",
        marginHorizontal: 6,
    },
    quickText: {
        color: "#374151",
        fontWeight: "600",
    },
    prefillBanner: {
        backgroundColor: "#e0f7fa",
        borderLeftWidth: 4,
        borderColor: "#00796b",
        padding: 12,
        borderRadius: 12,
        marginBottom: 16,
    },
    prefillText: {
        color: "#00796b",
        fontWeight: "500",
    },
});