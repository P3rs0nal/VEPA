import { initializeApp } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBcKnjZm5LYqj5jx5VEqx9ywspgZyxNfsA",
    authDomain: "vepa-24b46.firebaseapp.com",
    projectId: "vepa-24b46",
    storageBucket: "vepa-24b46.firebasestorage.app",
    messagingSenderId: "170936495301",
    appId: "1:170936495301:web:6f15b8fa08deeb01d5d4ac",
    measurementId: "G-F8NFZ6SRKR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

document.getElementById("login-btn").addEventListener("click", async () => {
    const enteredPassword = document.getElementById("admin-password").value.trim();
    const errorMessage = document.getElementById("error-message");

    if (!enteredPassword) {
        errorMessage.textContent = "Please enter a password.";
        return;
    }

    try {
        const docRef = doc(db, "users", "password");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const storedPassword = docSnap.data().password;
            if (enteredPassword === storedPassword) {
                sessionStorage.setItem("admin-auth", "true");
                window.location.href = "admin.html";  // Redirect to admin page
            } else {
                errorMessage.textContent = "Incorrect password. Try again.";
            }
        } else {
            errorMessage.textContent = "Error fetching password.";
        }
    } catch (error) {
        console.error("Error checking password:", error);
        errorMessage.textContent = "Error logging in. Try again.";
    }
});