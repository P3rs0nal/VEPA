// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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
const analytics = getAnalytics(app);