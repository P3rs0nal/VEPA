// user.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBcKnjZm5LYqj5jx5VEqx9ywspgZyxNfsA",
  authDomain: "vepa-24b46.firebaseapp.com",
  projectId: "vepa-24b46",
  storageBucket: "vepa-24b46.firebasestorage.app",
  messagingSenderId: "170936495301",
  appId: "1:170936495301:web:6f15b8fa08deeb01d5d4ac",
  measurementId: "G-F8NFZ6SRKR"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Fetch car data from Firestore
async function fetchCarData() {
  const querySnapshot = await getDocs(collection(db, "cars"));
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Display cars for users
async function displayCars() {
  const carsContainer = document.getElementById("cars-container");
  const emptyDiv = document.getElementById("empty");
  const carDetails = await fetchCarData();
  console.log("Fetched cars: ", carDetails);

  carsContainer.innerHTML = "";
  emptyDiv.innerHTML = "";
  if (carDetails.length === 0) {
    const empty = document.createElement("h2");
    empty.innerText = "No Inventory";
    empty.classList.add("headings-below");
    emptyDiv.appendChild(empty);
    return;
  }

  carDetails.forEach(car => {
    const carItem = document.createElement("div");
    carItem.classList.add("car-item");

    carItem.innerHTML = `
      <img src="${car.image || 'GenCar.png'}" id="img">
      <h3>${car.make} ${car.model}</h3>
      <div class="car-price">$${car.price}</div>
    `;

    carItem.onclick = () => openUserCarModal(car);
    carsContainer.appendChild(carItem);
  });
  animateCarItems();
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.querySelector("#cars-container")) displayCars();
  if (document.querySelector(".cars-table")) displayCarsAdmin();
});
// Open the modal to show user car details
function openUserCarModal(car) {
  const modal = document.getElementById("user-car-modal");
  modal.classList.add("show");

  const images = Array.isArray(car.images)
  ? car.images.map(img => typeof img === "string" ? img : img.url)
  : [car.image || "GenCar.png"];
  let currentImageIndex = 0;

  modal.innerHTML = `
    <div class="modal-content">
      <span class="close-btn" onclick="closeUserCarModal()">&times;</span>
      <h2>${car.make} ${car.model}</h2>
      <div class="slideshow-container">
        <img class="modal-image" src="${images[currentImageIndex]}" alt="${car.make} ${car.model}" />
        <button class="prev">&#10094;</button>
        <button class="next">&#10095;</button>
      </div>
      <p><strong>Price:</strong> $${car.price}</p>
      <p><strong>Condition:</strong> ${car.condition || "N/A"}</p>
      <p><strong>Year:</strong> ${car.year || "N/A"}</p>
      <p><strong>Body Type:</strong> ${car.bodyType || "N/A"}</p>
      <p><strong>Color:</strong> ${car.color || "N/A"}</p>
      <p><strong>Body Condition:</strong> ${car.bodyCondition || "N/A"}</p>
      <p><strong>Interior Condition:</strong> ${car.interiorCondition || "N/A"}</p>
      <p><strong>Transmission:</strong> ${car.transmission || "N/A"}</p>
      <p><strong>Wheels:</strong> ${car.wheels || "N/A"}</p>
      <p><strong>Capacity:</strong> ${car.capacity || "N/A"} passengers</p>
      <p><strong>Features:</strong> ${(car.features || []).join(", ") || "None"}</p>
      <button onclick="closeUserCarModal()">Close</button>
    </div>
  `;

  const modalImage = modal.querySelector('.modal-image');

  const updateImage = () => {
    modalImage.classList.remove("fade-in");
    modalImage.classList.add("fade-out");

    setTimeout(() => {
      modalImage.src = images[currentImageIndex];
      modalImage.classList.remove("fade-out");
      modalImage.classList.add("fade-in");
    }, 300);
  };

  modal.querySelector('.prev').onclick = () => {
    currentImageIndex = (currentImageIndex - 1 + images.length) % images.length;
    updateImage();
  };

  modal.querySelector('.next').onclick = () => {
    currentImageIndex = (currentImageIndex + 1) % images.length;
    updateImage();
  };
}

// Close user modal
function closeUserCarModal() {
  document.getElementById("user-car-modal").classList.remove("show");
}

// Animations for car items
function animateCarItems() {
  const items = document.querySelectorAll(".car-item");

  items.forEach(item => {
    item.addEventListener("mouseenter", () => {
      gsap.to(item, {
        y: -8,
        scale: 1.02,
        boxShadow: "0 12px 24px rgba(159, 85, 202, 0.4)",
        duration: 0.3,
        ease: "power2.out"
      });
    });

    item.addEventListener("mouseleave", () => {
      gsap.to(item, {
        y: 0,
        scale: 1,
        boxShadow: "0 6px 15px rgba(0, 0, 0, 0.3)",
        duration: 0.3,
        ease: "power2.inOut"
      });
    });
  });
}

// Filter and reset functionality for user side
async function filterCars() {
  const make = document.getElementById("filter-make").value.trim().toLowerCase();
  const model = document.getElementById("filter-model").value.trim().toLowerCase();
  const minPrice = parseFloat(document.getElementById("filter-price-min").value) || 0;
  const maxPrice = parseFloat(document.getElementById("filter-price-max").value) || Infinity;
  const carDetails = await fetchCarData();

  const filtered = carDetails.filter(car => {
    const carMake = car.make?.toLowerCase() || "";
    const carModel = car.model?.toLowerCase() || "";
    const carPrice = parseFloat(car.price?.toString().replace(/[$,]/g, "")) || 0;

    return (!make || carMake.includes(make)) &&
           (!model || carModel.includes(model)) &&
           (carPrice >= minPrice && carPrice <= maxPrice);
  });

  displayFilteredCars(filtered);
}

function displayFilteredCars(filteredCars) {
  const carsContainer = document.getElementById("cars-container");
  carsContainer.innerHTML = "";

  filteredCars.forEach(car => {
    const carItem = document.createElement("div");
    carItem.classList.add("car-item");

    carItem.innerHTML = `
      <img src="${car.image || 'GenCar.png'}" id="img">
      <h3>${car.make} ${car.model}</h3>
      <div class="car-price">$${car.price}</div>
    `;

    carItem.onclick = () => openUserCarModal(car);
    carsContainer.appendChild(carItem);
  });
}

function resetFilters() {
  ["filter-make", "filter-model", "filter-price-min", "filter-price-max"].forEach(id => {
    document.getElementById(id).value = "";
  });
  displayCars();
}

window.displayCars = displayCars;
window.fetchCarData = fetchCarData;
window.openUserCarModal = openUserCarModal;
window.closeUserCarModal = closeUserCarModal;
window.animateCarItems = animateCarItems;
window.filterCars = filterCars;
window.resetFilters = resetFilters;