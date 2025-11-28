import { Stack } from "expo-router";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./AuthProvider";
import { ThemeProvider } from "./theme";

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        {/* Provide safe area context app-wide so SafeAreaView/useSafeAreaInsets work correctly */}
        <SafeAreaProvider>
          {/* Hide the default Stack header so screens use their own custom headers */}
          <Stack screenOptions={{ headerShown: false }} />
        </SafeAreaProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
