import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

export function initFirebase() {
  if (getApps().length > 0) return;

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) {
    console.warn("[Firebase] FIREBASE_SERVICE_ACCOUNT_JSON not set — Firebase features disabled.");
    return;
  }

  try {
    const serviceAccount = JSON.parse(json);
    initializeApp({
      credential: cert(serviceAccount),
      storageBucket: `${serviceAccount.project_id}.appspot.com`,
    });
    console.log("[Firebase] Admin SDK initialized.");
  } catch (err) {
    console.error("[Firebase] Failed to parse service account JSON:", err.message);
    process.exit(1);
  }
}

export function getFirebaseAuth() {
  return getAuth();
}

export function getFirebaseStorage() {
  return getStorage();
}
