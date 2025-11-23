
import { StyleSheet, Dimensions } from "react-native";

export const { width, height } = Dimensions.get("window");

export const COLORS = {
  primary: "#1E90FF",
  secondary: "#48D1CC",
  accent: "#FF6347",

  success: "#00C851",
  error: "#ff4444",

  black: "#171717",
  white: "#FFFFFF",
  background: "#F5F5F5",
  lightGray: "#F8F8F8",
};

export const SIZES = {
  base: 8,
  font: 14,
  radius: 12,
  padding: 24,

  // font sizes
  h1: 30,
  h2: 22,
  h3: 16,
  h4: 14,
};

export const commonStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    padding: SIZES.padding,
    backgroundColor: COLORS.background,
  },
  header: {
    fontSize: SIZES.h2,
    fontWeight: "bold",
    textAlign: "center",
    marginVertical: SIZES.padding,
  },
  button: {
    backgroundColor: COLORS.primary,
    padding: SIZES.padding / 1.5,
    borderRadius: SIZES.radius,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: COLORS.white,
    fontSize: SIZES.h4,
    fontWeight: "bold",
  },
  input: {
    height: 40,
    marginVertical: SIZES.base,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
    padding: SIZES.base,
    borderRadius: SIZES.radius,
    backgroundColor: COLORS.white,
  },
});

