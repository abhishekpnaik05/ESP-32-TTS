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
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "./frontend")));

// ----- HTTP SERVER -----
const server = app.listen(process.env.PORT || 3000, () =>
  console.log(`🚀 Server online on ${process.env.PORT || 3000}`)
);

// -----------------------------------------------------------
// ---------------------  WEBSOCKET SERVER -------------------
// -----------------------------------------------------------
const wss = new WebSocketServer({ server });

let espSocket = null;     // Store ESP32 connection
let browserSockets = new Set(); // Track browsers

wss.on("connection", (ws) => {
  console.log("🔗 New WS client connected");

  // Add every new socket as a browser until proven ESP
  browserSockets.add(ws);

  ws.on("message", (msg) => {
    const text = msg.toString().trim();
    console.log("📨 Received:", text);

    // ------------------- ESP32 IDENTIFICATION -------------------
    if (text === "ESP32_READY") {
      espSocket = ws;
      browserSockets.delete(ws);
      console.log("🟢 ESP32 registered");
      return;
    }

    // ----------------- IF MESSAGE FROM BROWSER -------------------
    if (browserSockets.has(ws)) {
      console.log("🌐 Browser sent:", text);

      if (espSocket && espSocket.readyState === 1) {
        espSocket.send(text);
        console.log("📤 Sent to ESP32 →", text);
      } else {
        console.log("⚠️ ESP32 NOT CONNECTED – browser message ignored");
      }
      return;
    }

    // ----------------- IF MESSAGE FROM ESP32 -------------------
    if (ws === espSocket) {
      console.log("🤖 ESP32 says:", text);

      // Forward to all browsers
      browserSockets.forEach((client) => {
        if (client.readyState === 1) client.send(text);
      });

      console.log("📤 Broadcast to browsers");
    }
  });

  ws.on("close", () => {
    console.log("❌ WebSocket closed");

    if (ws === espSocket) {
      espSocket = null;
      console.log("🔴 ESP32 Disconnected");
    }

    if (browserSockets.has(ws)) {
      browserSockets.delete(ws);
      console.log("🔻 Browser disconnected");
    }
  });
});

// -----------------------------------------------------------
// ---------------------- OTA ENDPOINTS -----------------------
// -----------------------------------------------------------

app.post("/upload-firmware", upload.single("firmware"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });

  latestFirmwarePath = req.file.path;
  console.log("📦 New firmware stored:", req.file.path);

  res.json({ status: "uploaded" });
});

// ESP32 downloads latest firmware here
app.get("/firmware.bin", (req, res) => {
  if (!latestFirmwarePath) return res.status(404).send("No firmware yet");
  res.sendFile(path.join(__dirname, latestFirmwarePath));
});

// ----- FRONTEND FALLBACK -----
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "./frontend/index.html"));
});
