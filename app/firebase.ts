import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from "firebase/auth";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyCx2dmBFS1F8uJoOf68ze43-ctPyjVoMz8",
    authDomain: "spendly-d908b.firebaseapp.com",
    projectId: "spendly-d908b",
    storageBucket: "spendly-d908b.firebasestorage.app",
    messagingSenderId: "1097851744961",
    appId: "1:1097851744961:web:79a670c182d5058bd09a40",
    measurementId: "G-RRBQ7SFF0Z"
};

const app = initializeApp(firebaseConfig);

// initializeAuth with React Native persistence (AsyncStorage)
export const auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
});