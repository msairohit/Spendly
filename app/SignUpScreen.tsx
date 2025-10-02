import { useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "./AuthProvider";

export default function SignUpScreen() {
    const router = useRouter();
    const { signUp } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);

    async function onSignUp() {
        if (password !== confirm) {
            alert("Passwords do not match");
            return;
        }
        setBusy(true);
        try {
            await signUp(email.trim(), password);
            router.push("/AddExpenseScreen");
        } catch (e: any) {
            alert(e.message || "Sign up failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.emoji}>🧑‍💻</Text>
                <Text style={styles.title}>Create account</Text>
                <Text style={styles.sub}>Start tracking smarter</Text>
            </View>

            <View style={styles.card}>
                <TextInput placeholder="Email" keyboardType="email-address" autoCapitalize="none" style={styles.input} value={email} onChangeText={setEmail} />
                <TextInput placeholder="Password" secureTextEntry style={styles.input} value={password} onChangeText={setPassword} />
                <TextInput placeholder="Confirm password" secureTextEntry style={styles.input} value={confirm} onChangeText={setConfirm} />

                <TouchableOpacity style={styles.button} onPress={onSignUp} disabled={busy}>
                    <Text style={styles.buttonText}>{busy ? "Creating..." : "Create account"}</Text>
                </TouchableOpacity>

                <View style={styles.row}>
                    <Text style={styles.small}>Already have an account?</Text>
                    <TouchableOpacity onPress={() => router.push("/SignInScreen")}>
                        <Text style={styles.link}> Sign in</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: "#fdfcf8", justifyContent: "center" },
    header: { alignItems: "center", marginBottom: 18 },
    emoji: { fontSize: 40 },
    title: { fontSize: 26, fontWeight: "800", marginTop: 8 },
    sub: { color: "#6b7280", marginTop: 6 },
    card: { backgroundColor: "#fff", padding: 18, borderRadius: 14, elevation: 3 },
    input: { backgroundColor: "#f3f4f6", padding: 12, borderRadius: 12, marginBottom: 12 },
    button: { backgroundColor: "#10b981", padding: 14, borderRadius: 12, alignItems: "center", marginTop: 6 },
    buttonText: { color: "#fff", fontWeight: "700" },
    row: { flexDirection: "row", justifyContent: "center", marginTop: 12 },
    small: { color: "#6b7280" },
    link: { color: "#10b981", fontWeight: "700" },
});