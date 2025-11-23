
import { Stack } from "expo-router";
import { AuthProvider } from "./AuthProvider";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { commonStyles } from "./styles/common";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SafeAreaView style={commonStyles.safeArea}>
          <Stack
            screenOptions={{
              headerStyle: {
                backgroundColor: commonStyles.container.backgroundColor,
              },
              headerTitleStyle: {
                fontSize: commonStyles.header.fontSize,
                fontWeight: commonStyles.header.fontWeight as 'bold',
              },
              headerTitleAlign: "center",
            }}
          />
        </SafeAreaView>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
