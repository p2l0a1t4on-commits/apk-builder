import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  userProfile: any | null;
  userAccount: any | null;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [userAccount, setUserAccount] = useState<any | null>(null);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;
    let unsubAccount: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Setup real-time listeners IMMEDIATELY to get latest data as soon as possible
        unsubProfile = onSnapshot(doc(db, 'users', user.uid), (snap) => {
          if (snap.exists()) setUserProfile(snap.data());
        }, (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`));

        unsubAccount = onSnapshot(doc(db, 'accounts', user.uid), (snap) => {
          if (snap.exists()) setUserAccount(snap.data());
        }, (err) => handleFirestoreError(err, OperationType.GET, `accounts/${user.uid}`));

        await ensureUserRecord(user);
      } else {
        setUserProfile(null);
        setUserAccount(null);
        if (unsubProfile) unsubProfile();
        if (unsubAccount) unsubAccount();
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
      if (unsubAccount) unsubAccount();
    };
  }, []);

  const ensureUserRecord = async (user: User) => {
    const userRef = doc(db, 'users', user.uid);
    const accountRef = doc(db, 'accounts', user.uid);

    try {
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        const profile = {
          userId: user.uid,
          email: user.email,
          displayName: user.displayName || 'Bashid User',
          photoURL: user.photoURL || '',
          createdAt: serverTimestamp(),
        };
        await setDoc(userRef, profile);
      }

      const accountSnap = await getDoc(accountRef);
      if (!accountSnap.exists()) {
        const startingBalance = user.email === 'plototon01@gmail.com' ? 999999999 : 0;
        const account = {
          userId: user.uid,
          balance: startingBalance,
          sartirCoinBalance: 0,
          currency: 'BSD',
          updatedAt: serverTimestamp(),
        };
        await setDoc(accountRef, account);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users/accounts');
    }
  };

  return (
    <FirebaseContext.Provider value={{ 
      user, 
      loading, 
      userProfile, 
      userAccount
    }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};
