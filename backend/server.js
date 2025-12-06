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

// Multer for firmware upload
const upload = multer({ dest: "uploads/" });

let latestFirmwarePath = null;

// Pending command storage (simple single-slot queue).
// When the ESP GETs /api/esp32/command, the value is returned and cleared.
// (You can modify behavior to keep commands until acknowledged if you want.)
let pendingCommand = "";

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

let espSocket = null;           // store ESP WebSocket connection (if any)
let browserSockets = new Set(); // connected browser clients

wss.on("connection", (ws) => {
  console.log("🔗 New WS client connected");

  // default: treat as browser until it identifies as ESP
  browserSockets.add(ws);

  ws.on("message", (msg) => {
    const text = msg.toString().trim();
    console.log("📨 WS Received:", text);

    // ESP identification
    if (text === "ESP32_READY" || text === "ESP32_IDLE") {
      espSocket = ws;
      browserSockets.delete(ws);
      console.log("🟢 ESP32 registered via WebSocket");
      // Optionally send a greeting
      try { ws.send("SERVER: Hello ESP"); } catch(e) {}
      return;
    }

    // If message came from a browser connection:
    if (browserSockets.has(ws)) {
      console.log("🌐 Browser sent:", text);

      // Prefer WebSocket direct forward if ESP connected
      if (espSocket && espSocket.readyState === 1) {
        espSocket.send(text);
        console.log("📤 Forwarded to ESP via WS →", text);
      } else {
        // Queue as pending command so ESP can fetch via HTTP polling
        pendingCommand = text;
        console.log("📥 Stored pendingCommand (for polled ESP):", pendingCommand);
      }
      return;
    }

    // If message came from ESP socket:
    if (ws === espSocket) {
      console.log("🤖 ESP32 says:", text);
      // Broadcast to all browsers
      browserSockets.forEach((client) => {
        if (client.readyState === 1) client.send(text);
      });
      return;
    }
  });

  ws.on("close", () => {
    console.log("❌ WS closed");

    if (ws === espSocket) {
      espSocket = null;
      console.log("🔴 ESP32 Disconnected (WS)");
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
  res.json({ status: "uploaded", path: req.file.path });
});

// ESP32 downloads latest firmware here
app.get("/firmware.bin", (req, res) => {
  if (!latestFirmwarePath) return res.status(404).send("No firmware yet");
  res.sendFile(path.join(__dirname, latestFirmwarePath));
});

// -----------------------------------------------------------
// ------------------- ESP POLLING / API ---------------------
// -----------------------------------------------------------

// Device polls this endpoint (GET) to fetch next command.
// Response is plain text (e.g. "OTA_UPDATE", "UPLOAD:http://...", or any text to speak).
// The returned command is cleared so it won't be delivered again.
app.get("/api/esp32/command", (req, res) => {
  const cmd = pendingCommand || "";
  // clear after delivering
  pendingCommand = "";
  res.set("Content-Type", "text/plain");
  res.send(cmd);
  console.log("[API] /api/esp32/command ->", cmd || "<empty>");
});

// External POST to set a raw command string (useful for scripts)
app.post("/api/esp32/command", (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: "Missing 'command' in JSON body" });
  pendingCommand = command.toString();
  console.log("[API] Stored pendingCommand:", pendingCommand);

  // If ESP is connected via WS, forward immediately
  if (espSocket && espSocket.readyState === 1) {
    try { espSocket.send(pendingCommand); console.log("📤 Forwarded to ESP via WS"); }
    catch(e){ console.log("⚠ failed to forward via ws:", e.message); }
  }

  res.json({ ok: true });
});

// Push text-to-speak
app.post("/api/esp32/speak", (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Missing 'text' in JSON body" });
  pendingCommand = text.toString();
  console.log("[API] speak ->", pendingCommand);

  if (espSocket && espSocket.readyState === 1) {
    try { espSocket.send(pendingCommand); console.log("📤 forwarded to ESP via WS"); } catch(e){}
  }

  res.json({ ok: true });
});

// Push an UPLOAD:<url> command so ESP will download and play the mp3
app.post("/api/esp32/upload-url", (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "Missing 'url' in JSON body" });
  pendingCommand = "UPLOAD:" + url;
  console.log("[API] upload-url ->", pendingCommand);

  if (espSocket && espSocket.readyState === 1) {
    try { espSocket.send(pendingCommand); console.log("📤 forwarded to ESP via WS"); } catch(e){}
  }

  res.json({ ok: true });
});

// Trigger OTA command
app.post("/api/esp32/trigger-ota", (req, res) => {
  pendingCommand = "OTA_UPDATE";
  console.log("[API] trigger-ota -> OTA_UPDATE");

  if (espSocket && espSocket.readyState === 1) {
    try { espSocket.send("OTA_UPDATE"); console.log("📤 forwarded OTA via WS"); } catch(e){}
  }

  res.json({ ok: true });
});

// ESP posts status here (JSON); we log it and optionally broadcast to browsers
app.post("/api/esp32/status", (req, res) => {
  console.log("[STATUS] from ESP:", JSON.stringify(req.body));
  // broadcast to browsers via WS
  const payload = JSON.stringify({ src: "esp", status: req.body });
  browserSockets.forEach((client) => {
    if (client.readyState === 1) client.send(payload);
  });
  res.json({ ok: true });
});

// Simple ping endpoint that returns "pong" plaintext
app.get("/api/esp32/ping", (req, res) => {
  res.set("Content-Type", "text/plain");
  res.send("pong");
});

// -----------------------------------------------------------
// ---------------------- DEBUG / HELPERS --------------------
// -----------------------------------------------------------

// Endpoint to view and clear pending command (for debug)
app.get("/admin/pending", (req, res) => {
  res.json({ pending: pendingCommand });
});
app.post("/admin/clear-pending", (req, res) => {
  pendingCommand = "";
  res.json({ ok: true });
});

// ----- FRONTEND FALLBACK -----
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "./frontend/index.html"));
});
