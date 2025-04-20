const firebaseConfig = {
    apiKey: "AIzaSyBcKnjZm5LYqj5jx5VEqx9ywspgZyxNfsA",
    authDomain: "vepa-24b46.firebaseapp.com",
    projectId: "vepa-24b46",
    storageBucket: "vepa-24b46.firebasestorage.app",
    messagingSenderId: "170936495301",
    appId: "1:170936495301:web:6f15b8fa08deeb01d5d4ac",
    measurementId: "G-F8NFZ6SRKR"
  };
  
  import { initializeApp } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
  import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";
  import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-storage.js";
  
  const app = initializeApp(firebaseConfig);
  const storage = getStorage();
  const db = getFirestore(app);
  
  async function uploadImage(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "vepa_unsigned");
  
    const res = await fetch("https://api.cloudinary.com/v1_1/dyjfyxrve/image/upload", {
      method: "POST",
      body: formData
    });
  
    if (!res.ok) throw new Error("Cloudinary upload failed");
  
    const data = await res.json();
    return { url: data.secure_url, public_id: data.public_id }; // return both
  }  
 
  
  // Function to display cars in admin panel
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
            <img 
                src="${car.images?.[0] || 'GenCar.png'}" 
                alt="Thumbnail" 
                style="width: 100px; border-radius: 6px; cursor: pointer;" 
                onclick='openAdminImageModal(${JSON.stringify(car)})' 
            />
          </td>
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
  
  // Fetch car data from Firestore
  async function fetchCarData() {
    const querySnapshot = await getDocs(collection(db, "cars"));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
  
  // Admin - openAdminImageModal function
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
  
  // Add car to Firestore
  async function addCar() {
    const make = document.getElementById("car-make").value.trim();
    const model = document.getElementById("car-model").value.trim();
    const price = document.getElementById("car-price").value.trim();
    const imageFiles = Array.from(document.getElementById("car-images").files);
    const imageUrls = [];
  
    for (const file of imageFiles) {
        const { url, public_id } = await uploadImage(file);
        imageData.push({ url, public_id });
      }
      
      await addDoc(collection(db, "cars"), { make, model, price, images: imageData });
  
    if (!make || !model || !price || imageUrls.length === 0) return alert("Please fill in all fields.");
  
    try {
      await addDoc(collection(db, "cars"), { make, model, price, images: imageUrls });
      alert("Car added successfully!");
      displayCarsAdmin();
    } catch (err) {
      console.error("Error adding car:", err);
    }
  }
  
  // Remove a car from Firestore
  async function removeCar(carId) {
    if (!confirm("Are you sure you want to delete this car and its images?")) return;
  
    try {
      // Step 1: Get the car doc and its image public_ids
      const docRef = doc(db, "cars", carId);
      const snapshot = await getDoc(docRef);
      const data = snapshot.data();
  
      const public_ids = (data.images || [])
        .map(img => img.public_id)
        .filter(Boolean);
  
      // Step 2: Delete images from your Cloudinary delete server
      if (public_ids.length > 0) {
        await fetch("https://vepa.onrender.com", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_ids })
        });
      }
  
      // Step 3: Delete the Firestore document
      await deleteDoc(docRef);
      alert("Car and associated images deleted successfully!");
      displayCarsAdmin();
    } catch (err) {
      console.error("Error deleting car:", err);
      alert("Error deleting car.");
    }
  }  
  
  // Function to close the image modal
  function closeImageModal() {
      const modal = document.getElementById("view-images-modal");
      modal.classList.remove("show");
  }
  
  // Function to edit car details
  function openEditModal(car) {
      const modal = document.getElementById("edit-modal");
      modal.classList.add("show");
      modal.dataset.id = car.id;
      document.getElementById("edit-make").value = car.make;
      document.getElementById("edit-model").value = car.model;
      document.getElementById("edit-price").value = car.price;
  }
  
  // Save car edit changes
  async function saveEditCar() {
    const modal = document.getElementById("edit-modal");
    const carId = modal.dataset.id;
    const make = document.getElementById("edit-make").value.trim();
    const model = document.getElementById("edit-model").value.trim();
    const price = document.getElementById("edit-price").value.trim();
    
    try {
      const carRef = doc(db, "cars", carId);
      await updateDoc(carRef, {
        make, model, price
      });
      alert("Car updated successfully!");
      displayCarsAdmin();
      closeModal();
    } catch (err) {
      console.error("Error updating car:", err);
    }
  }
  
  document.addEventListener("DOMContentLoaded", () => {
    displayCarsAdmin();
  });  

  window.addCar = addCar;
  window.removeCar = removeCar;
  window.displayCarsAdmin = displayCarsAdmin;
  window.openAdminImageModal = openAdminImageModal;
  window.closeImageModal = closeImageModal;
  window.openEditModal = openEditModal;
  window.saveEditCar = saveEditCar;
  