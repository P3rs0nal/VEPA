// Full frontend + admin panel logic for VEPA AutoCare (with user car detail modal)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";

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

document.addEventListener("DOMContentLoaded", () => {
  if (document.querySelector("#cars-container")) displayCars();
  if (document.querySelector(".cars-table")) displayCarsAdmin();
});

async function fetchCarData() {
  const querySnapshot = await getDocs(collection(db, "cars"));
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function displayCars() {
    const carsContainer = document.getElementById("cars-container");
    const emptyDiv = document.getElementById("empty");
    const carDetails = await fetchCarData();
  
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
  
      // Attach click handler
      carItem.onclick = () => openUserCarModal(car);
      carsContainer.appendChild(carItem);
    });
    animateCarItems();
  }  
 
  function openUserCarModal(car) {
    const modal = document.getElementById("user-car-modal");
    modal.classList.add("show");
  
    modal.innerHTML = `
      <div class="modal-content">
        <span class="close-btn" onclick="closeUserCarModal()">&times;</span>
        <h2>${car.make} ${car.model}</h2>
        <img src="${car.image || 'GenCar.png'}" alt="${car.make} ${car.model}">
        <p><strong>Price:</strong> $${car.price}</p>
        <p><strong>Mileage:</strong> 72,000 miles</p>
        <p><strong>Condition:</strong> Excellent</p>
        <p><strong>Color:</strong> Midnight Purple</p>
        <button onclick="closeUserCarModal()">Close</button>
      </div>
    `;
  }
  
  function closeUserCarModal() {
    document.getElementById("user-car-modal").classList.remove("show");
  }
  
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

function resetFilters() {
  ["filter-make", "filter-model", "filter-price-min", "filter-price-max"].forEach(id => {
    document.getElementById(id).value = "";
  });
  displayCars();
}

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
    animateCarItems();
}   

async function displayCarsAdmin() {
  const carDetails = await fetchCarData();
  const filterValue = document.getElementById("admin-filter")?.value.toLowerCase() || "";
  const sortValue = document.getElementById("admin-sort")?.value;

  let filtered = carDetails.filter(car =>
    car.make?.toLowerCase().includes(filterValue) ||
    car.model?.toLowerCase().includes(filterValue)
  );

  if (sortValue === "make") filtered.sort((a, b) => a.make.localeCompare(b.make));
  if (sortValue === "model") filtered.sort((a, b) => a.model.localeCompare(b.model));
  if (sortValue === "price-asc") filtered.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
  if (sortValue === "price-desc") filtered.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));

  const table = document.querySelector(".cars-table");
  table.innerHTML = `
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

  const body = document.getElementById("cars-table-body");
  filtered.forEach(car => {
    body.innerHTML += `
      <tr>
        <td><img src="${car.image || 'GenCar.png'}" alt="Car" width="100"></td>
        <td>${car.make}</td>
        <td>${car.model}</td>
        <td>$${car.price}</td>
        <td>
          <button class="edit-btn" onclick='openEditModal(${JSON.stringify(car)})'>Edit</button>
          <button class="delete-btn" onclick="removeCar('${car.id}')">Delete</button>
        </td>
      </tr>
    `;
  });
}

async function addCar() {
  const make = document.getElementById("car-make").value.trim();
  const model = document.getElementById("car-model").value.trim();
  const price = document.getElementById("car-price").value.trim();
  const image = document.getElementById("car-image").value.trim() || "GenCar.png";

  if (!make || !model || !price) return alert("Please fill in all fields.");

  try {
    await addDoc(collection(db, "cars"), { make, model, price, image });
    alert("Car added successfully!");
    ["car-make", "car-model", "car-price", "car-image"].forEach(id => document.getElementById(id).value = "");
    displayCarsAdmin();
  } catch (err) {
    console.error("Error adding car:", err);
  }
}

async function removeCar(carId) {
  if (!confirm("Are you sure you want to delete this car?")) return;
  try {
    await deleteDoc(doc(db, "cars", carId));
    alert("Car removed successfully!");
    displayCarsAdmin();
  } catch (err) {
    console.error("Error deleting car:", err);
  }
}

function openEditModal(car) {
  const modal = document.getElementById("edit-modal");
  modal.classList.add("show");
  modal.dataset.id = car.id;
  document.getElementById("edit-make").value = car.make;
  document.getElementById("edit-model").value = car.model;
  document.getElementById("edit-price").value = car.price;
  document.getElementById("edit-image").value = car.image;
}

function closeModal() {
  document.getElementById("edit-modal").classList.remove("show");
}

async function saveEditCar() {
  const modal = document.getElementById("edit-modal");
  const carId = modal.dataset.id;
  const updated = {
    make: document.getElementById("edit-make").value.trim(),
    model: document.getElementById("edit-model").value.trim(),
    price: document.getElementById("edit-price").value.trim(),
    image: document.getElementById("edit-image").value.trim() || "GenCar.png"
  };

  if (!updated.make || !updated.model || !updated.price) return alert("All fields are required.");

  try {
    await updateDoc(doc(db, "cars", carId), updated);
    alert("Car updated successfully!");
    closeModal();
    displayCarsAdmin();
  } catch (err) {
    console.error("Error updating car:", err);
  }
}

window.addCar = addCar;
window.removeCar = removeCar;
window.filterCars = filterCars;
window.resetFilters = resetFilters;
window.openEditModal = openEditModal;
window.closeModal = closeModal;
window.saveEditCar = saveEditCar;
window.openUserCarModal = openUserCarModal;
window.closeUserCarModal = closeUserCarModal;