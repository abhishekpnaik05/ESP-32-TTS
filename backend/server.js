// server.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ---------- Static Frontend ----------
const __filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);
app.use(express.static(path.join(__dirname, "./frontend")));

// ---------- WebSocket Layer ----------
const server = app.listen(process.env.PORT || 3000, () =>
  console.log(`🌍 Server running on port ${process.env.PORT || 3000}`)
);

const wss = new WebSocketServer({ server });
let espSocket = null;

wss.on("connection", (ws) => {
  console.log("🔗 WebSocket client connected");

  ws.once("message", (msg) => {
    const text = msg.toString().trim();
    if (text === "ESP32_READY") {
      espSocket = ws;
      console.log("✅ ESP32 registered!");
      return;
    } else {
      forwardToESP(text);
    }
  });

  ws.on("message", (msg) => {
    const text = msg.toString().trim();
    if (espSocket && ws !== espSocket) {
      forwardToESP(text);
    }
  });

  ws.on("close", () => {
    if (ws === espSocket) {
      espSocket = null;
      console.log("❌ ESP32 disconnected");
    } else {
      console.log("❌ Web client disconnected");
    }
  });
});

function forwardToESP(text) {
  if (espSocket && espSocket.readyState === 1) {
    espSocket.send(text);
    console.log("📤 Sent to ESP32:", text);
  } else {
    console.log("⚠ No ESP32 connected, cannot send:", text);
  }
}

// ---------- REST fallback ----------
app.post("/send-text", (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "No text provided" });
  forwardToESP(text);
  res.json({ status: "sent", text });
});

// ---------- Fallback for frontend ----------
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "./frontend/index.html"));
});