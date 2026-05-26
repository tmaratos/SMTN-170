/**
 * TN-170 Firebase web config — paste your Firebase project keys here.
 * These are safe for the browser (not service account keys).
 */
window.TN170_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID",
  /** Cloud Functions region for httpsCallable */
  functionsRegion: "us-central1",
};

window.SMTN170_FIREBASE_CONFIG = window.TN170_FIREBASE_CONFIG;

window.FIREBASE_CONFIG = {
  ...window.TN170_FIREBASE_CONFIG,
  isConfigured: function isConfigured() {
    const c = window.TN170_FIREBASE_CONFIG || {};
    return !!(c.apiKey && c.projectId && c.apiKey !== "YOUR_API_KEY");
  },
};
