// Modern Firebase SDK (v9+ Modular)
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyDo0csGbzbviNH-CgdT5qNVyao2_cUAsmU",
    authDomain: "pkek-app.firebaseapp.com",
    projectId: "pkek-app",
    databaseURL: "https://pkek-app-default-rtdb.europe-west1.firebasedatabase.app",
    storageBucket: "pkek-app.firebasestorage.app",
    messagingSenderId: "896416499092",
    appId: "1:896416499092:web:d353fbfd7d085bb9903b81",
    measurementId: "G-38Z123DNKM"
};

let app;
let auth;
let db;

try {
    const existingApps = getApps();
    if (!existingApps.length) {
        app = initializeApp(firebaseConfig);
        getAnalytics(app);
    } else {
        app = existingApps[0];
    }
    auth = getAuth(app);
    db = getDatabase(app);
    console.log("Firebase Modular berhasil diinisialisasi.");
} catch (error) {
    console.error("Gagal inisialisasi Firebase:", error);
}
export { db, auth };
