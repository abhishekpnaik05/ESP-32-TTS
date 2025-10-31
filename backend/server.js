import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ---------- For serving static frontend files ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve frontend (inside ./frontend folder)
app.use(express.static(path.join(__dirname, "./frontend")));

// ---------- Backend API Logic ----------
let latestText = "";   // stores the latest text to speak
let spoken = true;     // whether ESP32 already took it

// 1️⃣ Route for frontend to send text
app.post("/send-text", (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "No text provided" });
  latestText = text;
  spoken = false;
  console.log("🟢 Received new text:", text);
  res.json({ status: "queued", text });
});

// 2️⃣ Route for ESP32 to fetch text
app.get("/get-text", (req, res) => {
  if (!spoken && latestText) {
    console.log("📤 ESP32 fetched:", latestText);
    spoken = true;
    res.json({ text: latestText });
  } else {
    res.json({ text: "" });  // no new message
  }
});

// 3️⃣ Catch-all route to serve frontend index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "./frontend/index.html"));
});

// ---------- Start server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌍 Server running on port ${PORT}`));
