import { initializeApp } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
import { getFirestore, collection, getDocs , addDoc, deleteDoc, doc} from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";

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

document.addEventListener("DOMContentLoaded", () => {
    displayCarsAdmin();
});

// Function to fetch car data from Firestore
async function fetchCarData() {
    const querySnapshot = await getDocs(collection(db, "cars"));
    const carDetails = [];
    querySnapshot.forEach((doc) => {
        carDetails.push({id: doc.id, ...doc.data()});  // Add car details to the array
    });
    console.log("Fetched: ", carDetails);
    return carDetails;
}

// Function to display car information in the container
async function displayCars() {
    const carDetails = await fetchCarData();
    const carsContainer = document.getElementById("cars-container");
    const emptyDiv = document.getElementById("empty");
    if(carDetails.length === 0){
        const empty = document.createElement("h2");
        empty.innerText = "No Inventory";
        empty.classList.add("headings-below");
        emptyDiv.appendChild(empty);
    }
    carDetails.forEach(car => {
        const carItem = document.createElement("div");
        carItem.classList.add("car-item");

        // Create the image element
        const carImage = document.createElement("img");
        carImage.src = car.image || "vepa.jpg"; // Use default if no image
        carImage.id = "img";

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

async function addCar(){
    const make = document.getElementById("car-make").value.trim();
    const model = document.getElementById("car-model").value.trim();
    const price = document.getElementById("car-price").value.trim();
    const image = document.getElementById("car-image").value.trim() || "vepa.jpg"; // Default image if empty
      
    if (!make || !model || !price) {
        alert("Please fill in all fields.");
        return;
    }

    const formattedPrice = window.accounting
        ? window.accounting.formatMoney(price, "$", 2)
        : `$${price}`;

    try {
        await addDoc(collection(db, "cars"), {
            make: make,
            model: model,
            price: price,
            image: image
        });

        alert("Car added successfully!");

        document.getElementById("car-make").value = "";
        document.getElementById("car-model").value = "";
        document.getElementById("car-price").value = "";
        document.getElementById("car-image").value = "";

        displayCarsAdmin();
    } catch (error) {
        console.error("Error adding car: ", error);
    }
}

async function removeCar(carId) {
    console.log("CAR ID ", carId);
    if (!confirm("Are you sure you want to delete this car?")) return;

    try {
        await deleteDoc(doc(db, "cars", carId));  
        alert("Car removed successfully!");
        displayCarsAdmin();  // Refresh table
    } catch (error) {
        console.error("Error removing car: ", error);
    }
}

async function displayCarsAdmin() {
    const carDetails = await fetchCarData();
    console.log(carDetails);
    const carsTable = document.querySelector(".cars-table");

    carsTable.innerHTML = `
    <thead>
        <tr>
            <th>Image</th>
            <th>Make</th>
            <th>Model</th>
            <th>Price</th>
            <th>Actions</th>
        </tr>
    </thead>
    <tbody id="cars-table-body"></tbody>
    `;

    const tableBody = document.getElementById("cars-table-body");
    
   

    carDetails.forEach(car => {
        const row = document.createElement("tr");

        const formattedPrice = window.accounting
            ? window.accounting.formatMoney(car.price.replace(/[$,]/g, ""), "$", 2)
            : `$${car.price}`;

        row.innerHTML = `
            <td><img src="${car.image || "vepa.jpg"}" alt="Car Image" style="width: 100px;"></td>
            <td>${car.make}</td>
            <td>${car.model}</td>
            <td>${formattedPrice}</td>
            <td><button onclick="removeCar('${car.id}')" class="delete-btn">Delete</button></td> 
        `;

        tableBody.appendChild(row);
    });
}

window.removeCar = removeCar;
window.addCar = addCar;

// Call the displayCars function to load the data
displayCars();
displayCarsAdmin();