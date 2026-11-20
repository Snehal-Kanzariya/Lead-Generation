import path from "node:path";
import fs from "node:fs";
import express from "express";
try { process.loadEnvFile(".env"); } catch { /* .env optional in production */ }
import { openDb } from "./db.ts";
import { createApp } from "./app.ts";

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 16) {
  console.error("JWT_SECRET must be set (16+ chars) in .env");
  process.exit(1);
}
const app = createApp(openDb(), secret);

// Serve the built client when present (single-process deployment).
const dist = path.resolve("dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`API on http://localhost:${port}  AI key: ${process.env.ANTHROPIC_API_KEY ? "set" : "MISSING"}`));
