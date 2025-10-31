import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ---------- Static frontend serving ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "./frontend")));

// ---------- Backend variables ----------
let latestText = ""; // stores the latest text to speak
let pending = false; // whether ESP32 needs to fetch it

// 🟢 1️⃣ Route for frontend to send text
app.post("/send-text", (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "No text provided" });

  latestText = text;
  pending = true; // mark as new message
  console.log("🟢 New text queued:", text);

  res.json({ status: "queued", text });
});

// 🟢 2️⃣ Route for ESP32 to fetch the latest text
app.get("/get-text", (req, res) => {
  if (pending && latestText) {
    console.log("📤 ESP32 fetched:", latestText);
    res.json({ text: latestText });

    // after delivering, clear for next round
    pending = false;
    latestText = "";
  } else {
    res.json({ text: "" }); // no new message
  }
});

// 🟢 3️⃣ Serve index.html for frontend UI
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "./frontend/index.html"));
});

// ---------- Start server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌍 Server running on port ${PORT}`));
