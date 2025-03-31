// adminFunctions.js

import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";

const db = getFirestore();

async function fetchCarData() {
    const querySnapshot = await getDocs(collection(db, "cars"));
    const carDetails = [];
    querySnapshot.forEach((doc) => {
        carDetails.push({id: doc.id, ...doc.data()});
    });
    return carDetails;
}

async function addCar() {
    const make = document.getElementById("car-make").value.trim();
    const model = document.getElementById("car-model").value.trim();
    const price = document.getElementById("car-price").value.trim();
    const image = document.getElementById("car-image").value.trim() || "vepa.jpg"; // Default image if empty
    
    if (!make || !model || !price) {
        alert("Please fill in all fields.");
        return;
    }

    try {
        await addDoc(collection(db, "cars"), {
            make: make,
            model: model,
            price: price,
            image: image
        });

        alert("Car added successfully!");
        displayCarsAdmin();
    } catch (error) {
        console.error("Error adding car: ", error);
    }
}

async function removeCar(carId) {
    if (!confirm("Are you sure you want to delete this car?")) return;

    try {
        await deleteDoc(doc(db, "cars", carId));
        alert("Car removed successfully!");
        displayCarsAdmin();
    } catch (error) {
        console.error("Error removing car: ", error);
    }
}

async function displayCarsAdmin() {
    const carDetails = await fetchCarData();
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
