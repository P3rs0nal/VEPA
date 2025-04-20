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
  
  function openAdminImageModal(car) {
    const modal = document.getElementById("view-images-modal");
    modal.classList.add("show");
  
    const images = car.images || [car.image || 'GenCar.png'];
    
    // Generate the scrollable view of images
    const imageScrollContainer = modal.querySelector(".image-scroll-container");
    imageScrollContainer.innerHTML = "";
    images.forEach(img => {
      const imgElement = document.createElement("img");
      imgElement.src = img;
      imgElement.alt = "Car image";
      imgElement.onclick = () => {
        window.open(img, '_blank'); // Open image in new tab when clicked
      };
      imageScrollContainer.appendChild(imgElement);
    });
  }

  function closeImageModal() {
    document.getElementById("view-images-modal").classList.remove("show");
  }  
  
 
  function openUserCarModal(car) {
    const modal = document.getElementById("user-car-modal");
    modal.classList.add("show");
  
    // Create the modal content with a slideshow
    const images = car.images || [car.image || 'GenCar.png']; // Ensure images is an array
  
    let currentImageIndex = 0;
  
    // Function to update the image being shown
    const updateImage = () => {
      const modalImage = modal.querySelector('.modal-image');
      
      // Add fade-out effect before changing the image
      modalImage.classList.add('fade-out');
  
      // After the fade-out is complete, update the image source and apply the fade-in effect
      setTimeout(() => {
        modalImage.src = images[currentImageIndex];
        modalImage.classList.remove('fade-out');
        modalImage.classList.add('fade-in');
      }, 300); // 300ms for fade-out duration
    };
  
    modal.innerHTML = `
      <div class="modal-content">
        <span class="close-btn" onclick="closeUserCarModal()">&times;</span>
        <h2>${car.make} ${car.model}</h2>
        <div class="slideshow-container">
          <img class="modal-image" src="${images[currentImageIndex]}" alt="${car.make} ${car.model}" />
          <button class="prev" onclick="changeImage(-1)">&#10094;</button>
          <button class="next" onclick="changeImage(1)">&#10095;</button>
        </div>
        <p><strong>Price:</strong> $${car.price}</p>
        <p><strong>Mileage:</strong> 72,000 miles</p>
        <p><strong>Condition:</strong> Excellent</p>
        <p><strong>Color:</strong> Midnight Purple</p>
        <button onclick="closeUserCarModal()">Close</button>
      </div>
    `;
  
    // Function to change image
    window.changeImage = (direction) => {
      currentImageIndex = (currentImageIndex + direction + images.length) % images.length;
      updateImage();
    };
  
    updateImage();
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
  const table = document.querySelector(".cars-table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Images</th>
        <th>Make</th>
        <th>Model</th>
        <th>Price</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="cars-table-body"></tbody>
  `;
  const body = document.getElementById("cars-table-body");
  carDetails.forEach(car => {
    body.innerHTML += `
      <tr>
        <td>
          <button onclick='openAdminImageModal(${JSON.stringify(car)})'>View Images</button>
        </td>
        <td>${car.make}</td>
        <td>${car.model}</td>
        <td>$${car.price}</td>
        <td>
          ${car.sold ? "<span>SOLD</span>" : `<button onclick='markCarAsSold("${car.id}")'>Mark as Sold</button>`}
        </td>
        <td>
          <button class="edit-btn" onclick='openEditModal(${JSON.stringify(car)})'>Edit</button>
          <button class="delete-btn" onclick="removeCar('${car.id}')">Delete</button>
        </td>
      </tr>
    `;
  });
}

function openAdminImageModal(car) {
  const modal = document.getElementById("view-images-modal");
  modal.classList.add("show");
  const images = car.images || [];
  const imageScrollContainer = modal.querySelector(".image-scroll-container");
  imageScrollContainer.innerHTML = "";

  images.forEach(img => {
    const imgElement = document.createElement("img");
    imgElement.src = img;
    imgElement.alt = "Car image";
    imgElement.onclick = () => window.open(img, '_blank');
    imageScrollContainer.appendChild(imgElement);
  });
}

async function markCarAsSold(carId) {
  const carRef = doc(db, "cars", carId);
  const soldTimestamp = new Date().toISOString();
  await updateDoc(carRef, { sold: true, soldTimestamp });
}

async function removeSoldCars() {
  const carDetails = await fetchCarData();
  const now = new Date();
  carDetails.forEach(car => {
    if (car.sold) {
      const soldTime = new Date(car.soldTimestamp);
      const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000); // 1 week ago
      if (soldTime < weekAgo) {
        deleteDoc(doc(db, "cars", car.id)); // Delete car after 1 week
      }
    }
  });
}


async function addCar() {
  const make = document.getElementById("car-make").value.trim();
  const model = document.getElementById("car-model").value.trim();
  const price = document.getElementById("car-price").value.trim();
  const images = Array.from(document.getElementById("car-images").files).map(file => file.name); // Add images array

  if (!make || !model || !price || images.length === 0) return alert("Please fill in all fields.");

  try {
    // Add car data to Firestore with images array
    await addDoc(collection(db, "cars"), { make, model, price, images });
    alert("Car added successfully!");
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
window.openAdminImageModal = openAdminImageModal;
window.closeImageModal = closeImageModal;