
import { useNavigation } from "@react-navigation/native";
import { router } from "expo-router";
import {
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    orderBy,
    query
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
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
    TouchableWithoutFeedback,
    View
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
    photoUri?: string | null;
    createdAt?: any;
};

const VIEW_MODES = ["timeline", "datewise", "weekly", "monthly", "calendar"] as const;
type ViewMode = typeof VIEW_MODES[number];

// ... (utility functions: startOfWeek, endOfWeek, startOfMonth, endOfMonth, etc.)

export default function ExpensesScreen() {
    const nav: any = useNavigation();
    const { user, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(true);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [viewMode, setViewMode] = useState<ViewMode>("timeline");
    const [filters, setFilters] = useState({ category: "", paymentMethod: "", tag: "", from: "", to: "", search: "" });
    const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

    // ... (useEffect for data fetching)

    const filtered = useMemo(() => {
        // ... (filtering logic)
    }, [expenses, filters]);

    const sections = useMemo(() => {
        // ... (timeline section logic)
    }, [filtered]);

    const monthly = useMemo(() => {
        // ... (monthly aggregation logic)
    }, [filtered]);

    const weekly = useMemo(() => {
        // ... (weekly aggregation logic)
    }, [filtered]);

    if (authLoading || loading) {
        return (
            <SafeAreaView style={[commonStyles.safeArea, { justifyContent: "center", alignItems: "center" }]}>
                <ActivityIndicator size="large" color={COLORS.primary} />
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
            <Text style={commonStyles.header}>Expenses</Text>
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

            <View style={commonStyles.container}>
                {/* Render content based on viewMode */}
            </View>

            {/* Modals for filters and expense details */}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    viewModeRow: {
        flexDirection: "row",
        padding: SIZES.padding / 2,
        backgroundColor: COLORS.lightGray,
        justifyContent: "space-around",
    },
    modeBtn: {
        paddingVertical: SIZES.base,
        paddingHorizontal: SIZES.base * 1.5,
        borderRadius: SIZES.radius,
    },
    modeBtnActive: {
        backgroundColor: COLORS.primary,
    },
    modeText: {
        color: COLORS.black,
        fontWeight: "bold",
    },
    modeTextActive: {
        color: COLORS.white,
    },
});
