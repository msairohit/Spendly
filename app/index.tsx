import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "./AuthProvider";

export default function Index() {
  const { user, loading, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    try {
      setBusy(true);
      await signOut();
    } catch (e: any) {
      alert(e?.message || "Logout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.topBackground}>
        <View style={styles.circleA} />
        <View style={styles.circleB} />
      </View>

      {user && (
        <TouchableOpacity
          onPress={handleLogout}
          disabled={busy}
          style={[styles.logoutBtn, busy && { opacity: 0.7 }]}
        >
          <Text style={styles.logoutText}>{busy ? "Signing out..." : "Logout"}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.container}>
        <Text style={styles.logo}>💰 Spendly</Text>
        <Text style={styles.hint}>Track your spending, stay intentional</Text>

        <View style={styles.card}>
          {loading ? (
            <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 20 }} />
          ) : user ? (
            <>
              <Text style={styles.welcome}>Welcome back</Text>
              <Text style={styles.email}>{user.email}</Text>

              <TouchableOpacity
                style={[styles.btn, { backgroundColor: "#10b981", marginTop: 18 }]}
                onPress={() => router.push("/AddExpenseScreen")}
              >
                <Text style={styles.btnText}>Add Expense</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, { backgroundColor: "#2563eb" }]}
                onPress={() => router.push("/ExpensesScreen")}
              >
                <Text style={styles.btnText}>Show expenses</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, { backgroundColor: "#f59e0b" }]}
                onPress={() => router.push("/AnalyticsScreen")}
              >
                <Text style={styles.btnText}>View Dashboard</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, { backgroundColor: "#6b7280" }]}
                onPress={() => router.push("/AnalyticsAdvancedScreen")}
              >
                <Text style={styles.btnText}>Advanced Analytics</Text>
              </TouchableOpacity>

            </>
          ) : (
            <>
              <TouchableOpacity style={[styles.btn, { backgroundColor: "#2563eb" }]} onPress={() => router.push("/SignInScreen")}>
                <Text style={styles.btnText}>Sign in</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.btn, { backgroundColor: "#10b981" }]} onPress={() => router.push("/SignUpScreen")}>
                <Text style={styles.btnText}>Create account</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.btn, { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb" }]} onPress={() => router.push("/AddExpenseScreen")}>
                <Text style={[styles.btnText, { color: "#374151" }]}>Skip (go to Add Expense)</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <Text style={styles.smallNote}>Tip: add tags to prepare custom filters & dashboards later</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0f172a" },
  topBackground: {
    height: Platform.OS === "ios" ? 220 : 200,
    backgroundColor: "transparent",
  },
  circleA: {
    position: "absolute",
    top: -40,
    left: -50,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "#1e293b",
    opacity: 0.9,
    transform: [{ rotate: "12deg" }],
  },
  circleB: {
    position: "absolute",
    top: -80,
    right: -30,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "#0ea5a4",
    opacity: 0.12,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: "#f8fafc",
    marginTop: -80,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 36,
  },
  logo: { fontSize: 40, textAlign: "center", marginBottom: 6 },
  hint: { color: "#6b7280", textAlign: "center", marginBottom: 18 },
  card: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 14,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  welcome: { fontSize: 18, fontWeight: "800", color: "#111827", textAlign: "center" },
  email: { textAlign: "center", color: "#6b7280", marginTop: 6 },
  btn: {
    width: "100%",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  btnText: { color: "#fff", fontWeight: "700" },
  smallNote: { textAlign: "center", color: "#9ca3af", marginTop: 12 },
  logoutBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 48 : 20,
    right: 16,
    backgroundColor: "#ef4444",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    zIndex: 40,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  logoutText: { color: "#fff", fontWeight: "700" },
});
