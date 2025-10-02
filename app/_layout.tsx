import { Stack } from "expo-router";
import { AuthProvider } from "./AuthProvider";

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack />
    </AuthProvider>
  );
}
