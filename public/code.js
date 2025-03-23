import { initializeApp } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCLcGYOHDRbDodauqsH-XRrXBh7cBBUluI",
  authDomain: "vepa-2a6cb.firebaseapp.com",
  projectId: "vepa-2a6cb",
  storageBucket: "vepa-2a6cb.firebasestorage.app",
  messagingSenderId: "949726559849",
  appId: "1:949726559849:web:cc3752498f08c4ba2b6cf8",
  measurementId: "G-8XH0325QZ6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Function to fetch car data from Firestore
async function fetchCarData() {
    const querySnapshot = await getDocs(collection(db, "cars"));
    const carDetails = [];
    querySnapshot.forEach((doc) => {
        carDetails.push(doc.data());  // Add car details to the array
    });
    return carDetails;
}

// Function to display car information in the container
async function displayCars() {
    const carDetails = await fetchCarData();
    const carsContainer = document.getElementById("cars-container");

    carDetails.forEach(car => {
        const carItem = document.createElement("div");
        carItem.classList.add("car-item");

        // Create the image element
        const carImage = document.createElement("img");
        carImage.src = car.image || "vepa.jpg"; // Use default if no image

        // Create the make and model heading
        const makeModel = document.createElement("h3");
        makeModel.classList.add("make-model");
        makeModel.textContent = `${car.make} ${car.model}`;  // Display make and model separately

        // Create the price element
        const carPrice = document.createElement("div");
        carPrice.classList.add("car-price");
        carPrice.textContent = car.price;

        // Append elements to the car item
        carItem.appendChild(carImage);
        carItem.appendChild(makeModel);
        carItem.appendChild(carPrice);

        // Append car item to the container
        carsContainer.appendChild(carItem);

        // Hover functionality for car item
        carItem.addEventListener('mouseenter', () => {
            carPrice.style.opacity = 1; // Show price on hover
        });
        carItem.addEventListener('mouseleave', () => {
            carPrice.style.opacity = 0; // Hide price when hover ends
        });
    });
}

// Call the displayCars function to load the data
displayCars();