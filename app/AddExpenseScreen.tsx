
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
    View,
    SafeAreaView
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useAuth } from "./AuthProvider";
import { db } from "./firebase";
import { router } from "expo-router";
import { useRoute } from "@react-navigation/native";
import { useSearchParams } from "expo-router";
import { commonStyles, SIZES, COLORS } from "./styles/common";

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

    const route: any = useRoute?.() ?? {};
    const searchParams = useSearchParams?.() ?? {};
    const prefillQuery = (searchParams as any).prefill as string | undefined;

    useEffect(() => {
        let mounted = true;

        async function resolveStringPrefill(raw: string) {
            let s = String(raw);
            for (let i = 0; i < 3; i++) {
                try {
                    return JSON.parse(s);
                } catch (e) {
                    try { s = decodeURIComponent(s); } catch { break; }
                }
            }
            try { return JSON.parse(raw); } catch { return null; }
        }

        (async () => {
            try {
                const navPrefill = route?.params?.prefill;
                let rawPrefill: any = null;
                if (navPrefill) rawPrefill = navPrefill;
                else if (prefillQuery) rawPrefill = await resolveStringPrefill(prefillQuery);

                if (!rawPrefill) return;

                const prefill = typeof rawPrefill === "object" ? rawPrefill : rawPrefill;

                if (prefill?.id && user?.email) {
                    try {
                        const userKey = encodeURIComponent(user.email);
                        const expRef = doc(db, "users", userKey, "expenses", String(prefill.id));
                        const snap = await getDoc(expRef);
                        if (snap.exists()) {
                            const data: any = snap.data();
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
                    }
                }

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
        alert("Implement pickImage using expo-image-picker or react-native-image-picker in your project.");
    }

    async function submitExpense() {
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
            createdAt: editingId ? undefined : serverTimestamp(),
            updatedAt: serverTimestamp(),
        };

        try {
            setSaving(true);
            const userKey = encodeURIComponent(user.email);
            const userDocRef = doc(db, "users", userKey);
            const expensesColRef = collection(userDocRef, "expenses");
            let savedId: string | null = null;
            if (editingId) {
                const expRef = doc(db, "users", userKey, "expenses", editingId);
                const { createdAt: _c, ...updatePayload } = expense as any;
                await updateDoc(expRef, updatePayload);
                savedId = editingId;
            } else {
                const docRef = await addDoc(expensesColRef, expense);
                savedId = docRef.id;
            }

            try {
                const prefillParam = route?.params?.prefill ?? (prefillQuery ? JSON.parse(decodeURIComponent(prefillQuery)) : null);
                const messageId = prefillParam?.messageId;
                if (messageId) {
                    const msgRef = doc(db, "users", userKey, "messages", String(messageId));
                    await updateDoc(msgRef, { processed: true, status: "added", expenseId: savedId });
                }
            } catch (msgErr) {
                console.warn("mark message as processed error", msgErr);
            }

            alert("Expense saved.");
            setDescription("");
            setAmount("");
            setCategory(null);
            setPaymentMethod(null);
            setSelectedTags([]);
            setPhotoUri(null);
            setDate(new Date());
            setExtrasOpen(false);
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
        <SafeAreaView style={commonStyles.safeArea}>
            <Text style={commonStyles.header}>Add Expense</Text>
            <ScrollView contentContainerStyle={commonStyles.container}>

                {(route?.params?.prefill || prefillQuery) ? (
                    <View style={styles.prefillBanner}>
                        <Text style={styles.prefillText}>Edit Expense!</Text>
                        <Text style={styles.prefillText}>Prefilled data, edit fields before saving</Text>
                    </View>
                ) : null}

                <View style={styles.card}>
                    <View style={styles.row}>
                        <TextInput
                            placeholder="Description"
                            style={[commonStyles.input, styles.flexTwo]}
                            value={description}
                            onChangeText={setDescription}
                            multiline={true}
                        />
                        <TextInput
                            placeholder="Amount"
                            keyboardType="numeric"
                            style={[commonStyles.input, { flex: 1 }]}
                            value={amount}
                            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
                        />
                    </View>

                    <TouchableOpacity style={styles.extrasToggle} onPress={toggleExtras}>
                        <Text style={styles.extrasToggleText}>{extrasOpen ? "Hide extras ▲" : "Show extras ▼"}</Text>
                    </TouchableOpacity>

                    {extrasOpen && (
                        <View>
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

                            <Text style={styles.fieldLabel}>Date & Time</Text>
                            <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => setShowDatePicker(true)}
                                style={styles.dateButton}
                            >
                                <Text style={styles.dateText}>{formattedDate}</Text>
                            </TouchableOpacity>

                            <Text style={styles.fieldLabel}>Photo</Text>
                            <View style={styles.photoRow}>
                                <TouchableOpacity style={styles.photoBox} onPress={pickImage}>
                                    {photoUri ? (
                                        <Image source={{ uri: photoUri }} style={styles.photo} />
                                    ) : (
                                        <Text style={styles.photoPlaceholder}>📷 Add photo</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    <TouchableOpacity style={[commonStyles.button, saving && { opacity: 0.7 }]} onPress={submitExpense} disabled={saving}>
                        <Text style={commonStyles.buttonText}>{saving ? "Saving..." : ((route?.params?.prefill || prefillQuery) ? "Edit Expense" : "Add Expense")}</Text>
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
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: COLORS.white,
        borderRadius: SIZES.radius,
        padding: SIZES.padding,
        marginBottom: SIZES.padding,
    },
    row: {
        flexDirection: "row",
        gap: SIZES.base,
        alignItems: "center",
        marginBottom: SIZES.base
    },
    flexTwo: {
        flex: 2,
    },
    extrasToggle: {
        marginVertical: SIZES.base,
    },
    extrasToggleText: {
        color: COLORS.primary,
        fontWeight: "600",
    },
    fieldLabel: {
        marginTop: SIZES.base,
        marginBottom: SIZES.base,
        color: COLORS.black,
        fontWeight: "600",
    },
    pickerRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: SIZES.base,
        marginBottom: SIZES.base,
    },
    pickerChip: {
        paddingVertical: SIZES.base,
        paddingHorizontal: SIZES.base * 1.5,
        borderRadius: SIZES.radius,
        backgroundColor: COLORS.lightGray,
    },
    pickerChipActive: {
        backgroundColor: COLORS.primary,
    },
    pickerChipText: {
        color: COLORS.black,
    },
    pickerChipTextActive: {
        color: COLORS.white,
    },
    tagsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: SIZES.base,
        marginBottom: SIZES.base,
    },
    tagChip: {
        paddingVertical: SIZES.base * 0.75,
        paddingHorizontal: SIZES.base * 1.25,
        borderRadius: SIZES.radius,
        backgroundColor: COLORS.lightGray,
    },
    tagChipActive: {
        backgroundColor: COLORS.secondary,
    },
    tagText: {
        color: COLORS.black,
    },
    tagTextActive: {
        color: COLORS.white,
    },
    dateButton: {
        backgroundColor: COLORS.lightGray,
        padding: SIZES.padding / 2,
        borderRadius: SIZES.radius,
        alignItems: "center",
        marginBottom: SIZES.base,
    },
    dateText: {
        color: COLORS.black,
        fontSize: SIZES.font,
    },
    photoRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: SIZES.base,
        marginBottom: SIZES.padding
    },
    photoBox: {
        width: 100,
        height: 100,
        borderRadius: SIZES.radius,
        backgroundColor: COLORS.lightGray,
        alignItems: "center",
        justifyContent: "center",
    },
    photo: {
        width: "100%",
        height: "100%",
        borderRadius: SIZES.radius,
    },
    photoPlaceholder: {
        color: COLORS.black,
    },
    prefillBanner: {
        backgroundColor: COLORS.secondary,
        padding: SIZES.padding,
        borderRadius: SIZES.radius,
        marginBottom: SIZES.padding,
    },
    prefillText: {
        color: COLORS.white,
        fontWeight: "bold",
    },
});
