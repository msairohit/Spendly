import { useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "./AuthProvider";

export default function SignInScreen() {
    const router = useRouter();
    const { signIn } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);

    async function onSignIn() {
        setBusy(true);
        try {
            await signIn(email.trim(), password);
            router.push("/AddExpenseScreen");
        } catch (e: any) {
            alert(e.message || "Sign in failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.emoji}>🔐</Text>
                <Text style={styles.title}>Welcome back</Text>
                <Text style={styles.sub}>Sign in to track your expenses</Text>
            </View>

            <View style={styles.card}>
                <TextInput
                    placeholder="Email"
                    placeholderTextColor="#050505ff"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                />
                <TextInput
                    placeholder="Password"
                    placeholderTextColor="#050505ff"
                    secureTextEntry
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                />

                <TouchableOpacity style={styles.button} onPress={onSignIn} disabled={busy}>
                    <Text style={styles.buttonText}>{busy ? "Signing in..." : "Sign in"}</Text>
                </TouchableOpacity>

                <View style={styles.row}>
                    <Text style={styles.small}>Don't have an account?</Text>
                    <TouchableOpacity onPress={() => router.push("/SignUpScreen")}>
                        <Text style={styles.link}> Create one</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: "#f7fbff", justifyContent: "center" },
    header: { alignItems: "center", marginBottom: 18 },
    emoji: { fontSize: 40 },
    title: { fontSize: 26, fontWeight: "800", marginTop: 8 },
    sub: { color: "#6b7280", marginTop: 6 },
    card: { backgroundColor: "#fff", padding: 18, borderRadius: 14, elevation: 3 },
    input: { backgroundColor: "#f3f4f6", padding: 12, borderRadius: 12, marginBottom: 12 },
    button: { backgroundColor: "#2563eb", padding: 14, borderRadius: 12, alignItems: "center", marginTop: 6 },
    buttonText: { color: "#fff", fontWeight: "700" },
    row: { flexDirection: "row", justifyContent: "center", marginTop: 12 },
    small: { color: "#6b7280" },
    link: { color: "#2563eb", fontWeight: "700" },
});