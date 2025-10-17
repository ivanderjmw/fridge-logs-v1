// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics (only on the client side)
// let analytics;
// if (typeof window !== 'undefined') {
//     isSupported().then((supported) => {
//         if (supported) {
//             analytics = getAnalytics(app);
//         }
//     });
// }
// 🔑 THE FIX: Use 'export const' to create a named export
export const db = getFirestore(app);