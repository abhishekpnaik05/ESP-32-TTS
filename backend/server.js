import express from "express";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());

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

// 3️⃣ Optional status route for testing
app.get("/", (req, res) => {
  res.send("✅ ESP32 TTS Cloud Backend is running!");
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌍 Server running on port ${PORT}`));
