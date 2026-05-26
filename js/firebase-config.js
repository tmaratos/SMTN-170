/**
 * TN-170 Firebase web config — paste your Firebase project keys here.
 * These are safe for the browser (not service account keys).
 */
window.TN170_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDZaerVKws3XFCRwBmvxEuwQdZfpbL1Gk0",
  authDomain: "tn-170-portal.firebaseapp.com",
  projectId: "tn-170-portal",
  storageBucket: "tn-170-portal.firebasestorage.app",
  messagingSenderId: "645835448409",
  appId: "1:645835448409:web:e850d728cc857972df1148",
  measurementId: "G-50V6RHQ6NF",
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

console.log("FIREBASE_CONFIG_LOADED");
