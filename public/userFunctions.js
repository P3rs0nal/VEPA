// userFunctions.js

import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";

const db = getFirestore();

async function fetchCarData() {
    const querySnapshot = await getDocs(collection(db, "cars"));
    const carDetails = [];
    querySnapshot.forEach((doc) => {
        carDetails.push({id: doc.id, ...doc.data()});
    });
    return carDetails;
}

async function filterCars() {
    const makeFilter = document.getElementById("filter-make").value.trim().toLowerCase();
    const modelFilter = document.getElementById("filter-model").value.trim().toLowerCase();
    const minPrice = parseFloat(document.getElementById("filter-price-min").value) || 0;
    const maxPrice = parseFloat(document.getElementById("filter-price-max").value) || Infinity;

    const carDetails = await fetchCarData();

    const filteredCars = carDetails.filter(car => {
        const carMake = car.make ? car.make.toLowerCase() : "";
        const carModel = car.model ? car.model.toLowerCase() : "";
        const carPrice = typeof car.price === "string" ? parseFloat(car.price.replace(/[$,]/g, "")) : parseFloat(car.price) || 0;

        return (
            (!makeFilter || carMake.includes(makeFilter)) &&
            (!modelFilter || carModel.includes(modelFilter)) &&
            (carPrice >= minPrice && carPrice <= maxPrice)
        );
    });

    displayFilteredCars(filteredCars);
}

function displayFilteredCars(filteredCars) {
    const carsContainer = document.getElementById("cars-container");
    carsContainer.innerHTML = filteredCars.length
        ? filteredCars.map(car => `
            <div class="car-item">
                <img src="${car.image || 'vepa.jpg'}" id="img" alt="Car Image">
                <h3>${car.make} ${car.model}</h3>
                <div class="car-price">$${car.price}</div>
            </div>
        `).join("")
        : "<h3>No cars match your criteria.</h3>";
}

function resetFilters() {
    document.getElementById("filter-make").value = "";
    document.getElementById("filter-model").value = "";
    document.getElementById("filter-price-min").value = "";
    document.getElementById("filter-price-max").value = "";

    displayCars();
}

window.filterCars = filterCars;
window.resetFilters = resetFilters;