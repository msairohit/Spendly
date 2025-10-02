import { router } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";

export default function Index() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text>welcome yo!!!</Text>
      <TouchableOpacity style={{ marginTop: 20, padding: 10, backgroundColor: "lightblue", borderRadius: 5 }}
        onPress={() => {
          // Navigate to AddExpenseScreen
          router.push("/AddExpenseScreen");
        }}
      >
        <Text>Go to Add Expense</Text>

      </TouchableOpacity>
    </View>
  );
}
