import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import multer from "multer";
import fs from "fs";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const upload = multer({ dest: "uploads/" });

let latestFirmwarePath = null;

// ----- STATIC FRONTEND -----
const __filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);
app.use(express.static(path.join(__dirname, "./frontend")));

// ----- HTTP SERVER -----
const server = app.listen(process.env.PORT || 3000, () =>
  console.log(`🚀 Server online on ${process.env.PORT || 3000}`)
);

// ----- WEBSOCKET ATTACH -----
const wss = new WebSocketServer({ server });

let espSocket = null;

wss.on("connection", (ws) => {
  console.log("🔗 New WS client");

  ws.on("message", (msg) => {
    const text = msg.toString().trim();
    console.log("📨 Received:", text);

    if (text === "ESP32_READY") {
      espSocket = ws;
      console.log("🟢 ESP32 Registered");
      return;
    }

    if (espSocket && ws !== espSocket) {
      espSocket.send(text);
      console.log("📤 Sent to ESP32 →", text);
    }
  });

  ws.on("close", () => {
    if (ws === espSocket) {
      espSocket = null;
      console.log("🔴 ESP32 Disconnected");
    }
  });
});

// ----- OTA UPLOAD ENDPOINT -----
app.post("/upload-firmware", upload.single("firmware"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });

  latestFirmwarePath = req.file.path;
  console.log("📦 New firmware stored:", req.file.path);

  res.json({ status: "uploaded" });
});

// ----- ESP32 DOWNLOADS FIRMWARE HERE -----
app.get("/firmware.bin", (req, res) => {
  if (!latestFirmwarePath) return res.status(404).send("No firmware yet");
  res.sendFile(path.join(__dirname, latestFirmwarePath));
});

// ----- FALLBACK FRONTEND -----
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "./frontend/index.html"));
});