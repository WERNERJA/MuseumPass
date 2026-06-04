import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import Constants from 'expo-constants';

/**
 * Firebase configuratie.
 *
 * Waarden komen uit app.json > extra zodat er geen secrets in git terechtkomen.
 * Vul je echte waarden in via de Firebase Console en zet ze in app.json (of
 * gebruik EAS Secrets voor productie).
 *
 * De projectId is al ingesteld op het echte project: museumpass-b3f1b.
 * Vul de overige YOUR_FIREBASE_* placeholders in via de Firebase Console.
 */
const firebaseConfig = {
  apiKey:
    Constants.expoConfig?.extra?.firebaseApiKey ?? 'YOUR_FIREBASE_API_KEY',
  authDomain:
    Constants.expoConfig?.extra?.firebaseAuthDomain ??
    'museumpass-b3f1b.firebaseapp.com',
  projectId:
    Constants.expoConfig?.extra?.firebaseProjectId ?? 'museumpass-b3f1b',
  storageBucket:
    Constants.expoConfig?.extra?.firebaseStorageBucket ??
    'museumpass-b3f1b.appspot.com',
  messagingSenderId:
    Constants.expoConfig?.extra?.firebaseMessagingSenderId ??
    'YOUR_FIREBASE_MESSAGING_SENDER_ID',
  appId:
    Constants.expoConfig?.extra?.firebaseAppId ?? 'YOUR_FIREBASE_APP_ID',
};

// Voorkom dubbele initialisatie tijdens React Native Fast Refresh
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

export const db: Firestore = getFirestore(app);
export default app;
