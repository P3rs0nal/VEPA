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

  console.clear()
const canvas = document.querySelector('canvas')
const ctx = canvas.getContext('2d')

resizeCanvas()

let pipes = []

class Pipe {
  constructor(x, y, size, xVel, yVel, clr) {
    this.x = x
    this.y = y
    this.size = size
    this.color = clr
    this.xVel = xVel
    this.xPrev = xVel
    this.yVel = yVel
    this.yPrev = yVel
    this.minDist = this.updateMinDist()
    this.dist = 0
    this.hasEnteredScreen = false
  }
  update() {
    this.x += this.xVel
    this.y += this.yVel
    this.dist++
    
    if (!this.hasEnteredScreen) {
      if (this.x > 0 && this.x < canvas.width && this.y > 0 && this.y < canvas.height) {
        this.hasEnteredScreen = true
      }
    }
    
    if (this.dist % this.minDist === 0) {
      if (Math.random() > 0.75) {
        this.changeDirections()
        this.minDist = this.updateMinDist()
      }
    }
  }
  draw() {
    const scale = 8
    const gradient = ctx.createRadialGradient(this.x, this.y, 2, this.x, this.y, this.size * scale);

    // Add three color stops
    gradient.addColorStop(0, "rgba(60, 0, 83, 0.04)");
    gradient.addColorStop(1, "rgba(60, 0, 83, 0)");

    // Set the fill style and draw a rectangle
    ctx.fillStyle = gradient;
    ctx.fillRect(this.x - this.size * (scale / 2), this.y - this.size * (scale / 2), this.size * scale, this.size * scale);
    
    ctx.beginPath()
    ctx.fillStyle = this.color
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fill()
    ctx.closePath()
  }
  updateMinDist() {
    return Math.floor(Math.random() * 100 + 50)
  }
  changeDirections() {
    const prevX = this.xVel
    const prevY = this.yVel
    this.xVel = Math.random() > 0.5 ? this.yPrev : this.yPrev * -1
    this.yVel = Math.random() > 0.5 ? this.xPrev : this.xPrev * -1
    this.xPrev = this.xVel
    this.yPrev = this.yVel
  }
}

function init(quantity, clr, scale = 1) {
  for (let i = 0; i < quantity; i++) {
    const speed = Math.random() * 0.4 + 0.25 
    let x, y, xVel, yVel
    // const size = Math.random() * 3 + 1
    const size = (Math.random() + 0.5 - 0.5) * scale
    if (Math.random() >= 0.5) {
      x = Math.random() > 0.5 ? size * -1 : canvas.width + size
      y = Math.random() * canvas.height
      xVel = x < 0 ? speed : speed * -1
      yVel = 0
    } else {
      x = Math.random() * canvas.width
      y = Math.random() > 0.5 ? size * -1 : canvas.height + size
      xVel = 0
      yVel = y < 0 ? speed : speed * -1
    }
    pipes.push(new Pipe(x, y, size, xVel, yVel, clr))
  }
}
init(16, '#9f55ca')
// init(16, '#fff')
setTimeout(() => {
  init(16, '#c07ee6', 1.5)
// init(10, '#fff', 1.1)
}, 1500) 
setTimeout(() => {
  init(8, '#e4c6f5', 2)
// init(6, '#fff', 1.25)
}, 3000) 

function animate() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.1)";  // Dark background with slight transparency
  ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas every frame

  for (let i = 0; i < pipes.length; i++) {
      pipes[i].update();
      pipes[i].draw();

      // If a pipe has completely left the screen, respawn it
      if (pipes[i].hasEnteredScreen) {
          if (pipes[i].x < -pipes[i].size || pipes[i].x > canvas.width + pipes[i].size ||
              pipes[i].y < -pipes[i].size || pipes[i].y > canvas.height + pipes[i].size) {
              
              // Respawn the pipe with new properties
              const speed = Math.random() * 0.4 + 0.25;
              let x, y, xVel, yVel;
              const size = (Math.random() + 0.5) * 1.5;

              if (Math.random() >= 0.5) {
                  x = Math.random() > 0.5 ? size * -1 : canvas.width + size;
                  y = Math.random() * canvas.height;
                  xVel = x < 0 ? speed : speed * -1;
                  yVel = 0;
              } else {
                  x = Math.random() * canvas.width;
                  y = Math.random() > 0.5 ? size * -1 : canvas.height + size;
                  xVel = 0;
                  yVel = y < 0 ? speed : speed * -1;
              }

              pipes[i] = new Pipe(x, y, size, xVel, yVel, pipes[i].color);
          }
      }
  }

  requestAnimationFrame(animate); // Keep looping
}
animate()

window.addEventListener('resize', resizeCanvas)

function resizeCanvas() {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
}

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
        const formattedPrice = window.accounting
        ? window.accounting.formatMoney(car.price, "$", 2)
        : `$${car.price}`;
        carPrice.textContent = formattedPrice;

        // Append elements to the car item
        carItem.appendChild(carImage);
        carItem.appendChild(makeModel);
        carItem.appendChild(carPrice);

        // Append car item to the container
        carsContainer.appendChild(carItem);

        // Hover functionality for car item
        // carItem.addEventListener('mouseenter', () => {
        //     carPrice.style.opacity = 1; // Show price on hover
        // });
        // carItem.addEventListener('mouseleave', () => {
        //     carPrice.style.opacity = 0; // Hide price when hover ends
        // });
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