// Authentication state for the whole app: who is logged in and what their role is.
// Any screen can read it with useAuth().
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { processQueue } from './outbox';

export type Role = 'inspector' | 'supervisor';
export type Profile = { uid: string; name: string; email: string; role: Role };

type AuthState = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
const profileCacheKey = (uid: string) => `profile:${uid}`;
const VALID_ROLES: Role[] = ['inspector', 'supervisor'];

// Reads the user's role document (users/{uid}) from Firestore.
// The result is cached on the phone so the app still knows the role when opened offline.
async function loadProfile(uid: string): Promise<Profile | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (!VALID_ROLES.includes(data.role)) return null;
    const profile: Profile = { uid, name: data.name ?? '', email: data.email ?? '', role: data.role };
    await AsyncStorage.setItem(profileCacheKey(uid), JSON.stringify(profile));
    return profile;
  } catch {
    // Offline (or Firestore unreachable): use the copy saved at the last successful load
    const cached = await AsyncStorage.getItem(profileCacheKey(uid));
    return cached ? (JSON.parse(cached) as Profile) : null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Firebase tells us whenever the user logs in or out (and on app start, from the saved session)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      setUser(firebaseUser);
      setProfile(firebaseUser ? await loadProfile(firebaseUser.uid) : null);
      setLoading(false);
      if (firebaseUser) processQueue(); // upload anything saved while signed out or offline
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  };

  const signOut = async () => {
    if (user) await AsyncStorage.removeItem(profileCacheKey(user.uid));
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
