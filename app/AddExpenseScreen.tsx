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

import React, { useMemo, useState } from "react";
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
// import * as ImagePicker from 'expo-image-picker'; // optional (Expo)
// Use emojis as icons so no extra vector-icon dependency is required.

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

    const headerScale = useMemo(() => new Animated.Value(1), []);

    function toggleExtras() {
        setExtrasOpen((s) => !s);
        Animated.sequence([
            Animated.timing(headerScale, { toValue: 0.98, duration: 120, useNativeDriver: true }),
            Animated.timing(headerScale, { toValue: 1, duration: 120, useNativeDriver: true }),
        ]).start();
    }

    function onChangeDate(event: any, selected?: Date) {
        setShowDatePicker(false);
        if (selected) setDate((prev) => new Date(selected.setHours(prev.getHours(), prev.getMinutes())));
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
        // For now set a temporary placeholder uri (developer should replace).
        setPhotoUri(null);
        alert("Implement pickImage using expo-image-picker or react-native-image-picker in your project.");
    }

    function submitExpense() {
        // Validate minimal fields
        if (!description.trim() || !amount.trim()) {
            alert("Please enter description and amount.");
            return;
        }
        const expense = {
            date: date.toISOString(),
            description,
            amount: parseFloat(amount),
            category,
            paymentMethod,
            tags: selectedTags,
            photoUri,
        };
        // TODO: persist expense (context / API / async storage)
        console.log("New expense", expense);
        alert("Expense added (wire up persistence).");
        // reset
        setDescription("");
        setAmount("");
        setCategory(null);
        setPaymentMethod(null);
        setSelectedTags([]);
        setPhotoUri(null);
        setDate(new Date());
        setExtrasOpen(false);
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

                <TouchableOpacity style={styles.addButton} onPress={submitExpense}>
                    <Text style={styles.addButtonText}>➕ Add Expense</Text>
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
});