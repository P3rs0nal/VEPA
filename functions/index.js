const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const { v2: cloudinary } = require("cloudinary");

admin.initializeApp();

cloudinary.config({
  cloud_name: "dyjfyxrve",
  api_key: "812316863949495",
  api_secret: "aZht30JPi_kBBgUCW1CEHzxCXpQ"  // Replace with your actual secret (keep secure!)
});

exports.deleteCarImages = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const { public_ids } = req.body;

    if (!Array.isArray(public_ids)) {
      return res.status(400).send("Invalid request body. Must include public_ids array.");
    }

    try {
      const results = await Promise.all(
        public_ids.map(id => cloudinary.uploader.destroy(id))
      );
      res.status(200).json({ success: true, results });
    } catch (err) {
      console.error("Cloudinary deletion failed:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });
});