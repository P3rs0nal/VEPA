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
  import { getFirestore, collection, getDocs, getDoc, addDoc, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";
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
        <th>Year</th>
        <th>Color</th>
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
              src="${car.images?.[0]?.url || 'GenCar.png'}"
              alt="Thumbnail" 
              style="width: 100px; border-radius: 6px; cursor: pointer;" 
              onclick='openAdminImageModal(${JSON.stringify(car)})' 
            />
          </td>
          <td>${car.make}</td>
          <td>${car.model}</td>
          <td>$${car.price}</td>
          <td>${car.year || "N/A"}</td>
          <td>${car.color || "N/A"}</td>
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
    modal.dataset.id = car.id;
  
    const imageScrollContainer = modal.querySelector(".image-scroll-container");
    imageScrollContainer.innerHTML = "";
  
    (car.images || []).forEach((img, index) => {
      const wrapper = document.createElement("div");
      wrapper.classList.add("image-wrapper");
  
      const imageEl = document.createElement("img");
      imageEl.src = img.url;
      imageEl.alt = "Car image";
  
      const deleteBtn = document.createElement("button");
      deleteBtn.classList.add("delete-icon");
      deleteBtn.innerHTML = "×";
      deleteBtn.onclick = () => {
        if (confirm("Are you sure you want to delete this image?")) {
          deleteImage(car.id, index, img.public_id);
        }
      };
  
      wrapper.appendChild(imageEl);
      wrapper.appendChild(deleteBtn);
      imageScrollContainer.appendChild(wrapper);
    });
  }
  
  async function deleteImage(carId, index, public_id) {
    try {
      // 1. Remove the image from Firestore
      const docRef = doc(db, "cars", carId);
      const snapshot = await getDoc(docRef);
      const carData = snapshot.data();
  
      const updatedImages = (carData.images || []).filter((_, i) => i !== index);
      await updateDoc(docRef, { images: updatedImages });
  
      // 2. Delete from Cloudinary (only if public_id is valid)
      if (public_id) {
        await fetch("https://your-render-url.onrender.com/delete-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_ids: [public_id] })
        });
      }
  
      alert("Image deleted!");
      openAdminImageModal({ id: carId, images: updatedImages });
    } catch (err) {
      console.error("Failed to delete image:", err);
      alert("Failed to delete image.");
    }
  }
  
  async function uploadNewImages() {
    const modal = document.getElementById("view-images-modal");
    const carId = modal.dataset.id;
    const fileInput = document.getElementById("new-image-upload");
    const files = Array.from(fileInput.files);
  
    if (files.length === 0) return alert("Please select image(s) to upload.");
  
    try {
      const uploaded = [];
  
      for (const file of files) {
        const { url, public_id } = await uploadImage(file);
        uploaded.push({ url, public_id });
      }
  
      const docRef = doc(db, "cars", carId);
      const snapshot = await getDoc(docRef);
      const current = snapshot.data().images || [];
  
      await updateDoc(docRef, { images: [...current, ...uploaded] });
  
      alert("Images uploaded!");
      openAdminImageModal({ id: carId, images: [...current, ...uploaded] });
      fileInput.value = "";
    } catch (err) {
      console.error("Image upload failed:", err);
      alert("Upload failed.");
    }
  }  
  
  // Add car to Firestore
  async function addCar() {
    const make = document.getElementById("car-make").value.trim();
    const model = document.getElementById("car-model").value.trim();
    const price = document.getElementById("car-price").value.trim();
    const year = document.getElementById("car-year").value.trim();
    const bodyType = document.getElementById("car-body-type").value.trim();
    const color = document.getElementById("car-color").value.trim();
    const bodyCondition = document.getElementById("car-body-condition").value.trim();
    const interiorCondition = document.getElementById("car-interior-condition").value.trim();
    const transmission = document.getElementById("car-transmission").value.trim();
    const wheels = document.getElementById("car-wheels").value.trim();
    const capacity = document.getElementById("car-capacity").value.trim();
    const condition = document.getElementById("car-condition").value;
    const features = document.getElementById("car-features").value.trim();
    const imageFiles = Array.from(document.getElementById("car-images").files);
    const imageData = [];
  
    if (!make || !model || !price || !year || !bodyType || !color || !bodyCondition || !interiorCondition || !transmission || !wheels || !capacity || !condition) {
      alert("Please fill in all required fields.");
      return;
    }
  
    if (imageFiles.length > 0) {
      for (const file of imageFiles) {
        const { url, public_id } = await uploadImage(file);
        imageData.push({ url, public_id });
      }
    } else {
      imageData.push({ url: "GenCar.png", public_id: null });
    }
  
    try {
      await addDoc(collection(db, "cars"), {
        make,
        model,
        price,
        year,
        bodyType,
        color,
        bodyCondition,
        interiorCondition,
        transmission,
        wheels,
        capacity,
        condition,
        features: features.split(",").map(f => f.trim()).filter(f => f !== ""),
        images: imageData
      });
      alert("Car added successfully!");
      displayCarsAdmin();
    } catch (err) {
      console.error("Error adding car:", err);
      alert("Error adding car.");
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
        await fetch("https://vepa.onrender.com/delete-images", {
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

  function closeModal() {
    document.getElementById("edit-modal").classList.remove("show");
  }
  
  
  // Function to edit car details
  function openEditModal(car) {
    const modal = document.getElementById("edit-modal");
    modal.classList.add("show");
    modal.dataset.id = car.id;
  
    document.getElementById("edit-make").value = car.make || "";
    document.getElementById("edit-model").value = car.model || "";
    document.getElementById("edit-price").value = car.price || "";
    document.getElementById("edit-year").value = car.year || "";
    document.getElementById("edit-body-type").value = car.bodyType || "";
    document.getElementById("edit-color").value = car.color || "";
    document.getElementById("edit-body-condition").value = car.bodyCondition || "";
    document.getElementById("edit-interior-condition").value = car.interiorCondition || "";
    document.getElementById("edit-transmission").value = car.transmission || "";
    document.getElementById("edit-wheels").value = car.wheels || "";
    document.getElementById("edit-capacity").value = car.capacity || "";
    document.getElementById("edit-condition").value = car.condition || "";
    document.getElementById("edit-features").value = (car.features || []).join(", ");
  }  
  
  // Save car edit changes
  async function saveEditCar() {
    const updated = {
      make: document.getElementById("edit-make").value.trim(),
      model: document.getElementById("edit-model").value.trim(),
      price: document.getElementById("edit-price").value.trim(),
      year: document.getElementById("edit-year").value.trim(),
      bodyType: document.getElementById("edit-body-type").value.trim(),
      color: document.getElementById("edit-color").value.trim(),
      bodyCondition: document.getElementById("edit-body-condition").value.trim(),
      interiorCondition: document.getElementById("edit-interior-condition").value.trim(),
      transmission: document.getElementById("edit-transmission").value.trim(),
      wheels: document.getElementById("edit-wheels").value.trim(),
      capacity: document.getElementById("edit-capacity").value.trim(),
      condition: document.getElementById("edit-condition").value.trim(),
      features: document.getElementById("edit-features").value.split(",").map(f => f.trim()).filter(f => f)
    };    
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
  window.closeModal = closeModal;
  window.uploadNewImages = uploadNewImages;
  window.deleteImage = deleteImage;
  