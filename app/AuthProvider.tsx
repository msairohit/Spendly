import {
    createUserWithEmailAndPassword,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    User,
} from "firebase/auth";
import React, { createContext, useContext, useEffect, useState } from "react";
import { auth } from "./firebase";

type AuthContextType = {
    user: User | null;
    loading: boolean;
    signUp: (email: string, password: string) => Promise<void>;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => {
            setUser(u);
            setLoading(false);
        });
        return unsub;
    }, []);

    async function signUp(email: string, password: string) {
        await createUserWithEmailAndPassword(auth, email, password);
    }

    async function signIn(email: string, password: string) {
        await signInWithEmailAndPassword(auth, email, password);
    }

    async function signOut() {
        await firebaseSignOut(auth);
    }

    return (
        <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}