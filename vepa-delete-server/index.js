const express = require("express");
const cors = require("cors");
const { v2: cloudinary } = require("cloudinary");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

cloudinary.config({
  cloud_name: "dyjfyxrve",
  api_key: "812316863949495",
  api_secret: "aZht30JPi_kBBgUCW1CEHzxCXpQ" // Replace with your actual secret
});

app.post("/delete-images", async (req, res) => {
  const { public_ids } = req.body;

  if (!Array.isArray(public_ids)) {
    return res.status(400).json({ error: "public_ids must be an array" });
  }

  try {
    const results = await Promise.all(
      public_ids.map(id => cloudinary.uploader.destroy(id))
    );
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/", (req, res) => res.send("Cloudinary Delete Server is running"));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));