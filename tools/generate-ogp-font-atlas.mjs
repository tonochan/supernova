#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chromePath = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const outFile = path.join(repoRoot, "workers", "replay-api", "ogp-font-atlas.mjs");
const fontFile = path.join(repoRoot, "assets", "fonts", "fredoka-latin.woff2");
const chars = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."abcdefghijklmnopqrstuvwxyz",
  ..."0123456789",
  " ",
  ",",
  ".",
  "-",
  "/",
  ":",
  "(",
  ")",
  "+",
  "!",
].join("");
const sizes = [10, 12, 14, 18, 22, 28, 34, 42, 64, 72];

function freePort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function httpJson(port, pathName, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: pathName, method }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitForChrome(port) {
  let lastError;
  for (let i = 0; i < 60; i++) {
    try {
      return await httpJson(port, "/json/version");
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError || new Error("Chrome did not start");
}

class CdpPage {
  constructor(webSocketUrl) {
    this.id = 0;
    this.pending = new Map();
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => this.onMessage(event));
  }

  onMessage(event) {
    const text = typeof event.data === "string" ? event.data : event.data.toString();
    const message = JSON.parse(text);
    if (!message.id || !this.pending.has(message.id)) return;
    const { resolve, reject } = this.pending.get(message.id);
    this.pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result || {});
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 8000);
    });
  }

  close() {
    this.socket.close();
  }
}

function generationSource(fontDataUrl) {
  return `
    (async () => {
      const font = new FontFace("Fredoka Local", "url(${fontDataUrl})");
      await font.load();
      document.fonts.add(font);
      await document.fonts.ready;

      const chars = ${JSON.stringify(chars)};
      const sizes = ${JSON.stringify(sizes)};
      const atlas = { family: "Fredoka Local", weights: "700", sizes: {} };

      for (const size of sizes) {
        const measure = document.createElement("canvas").getContext("2d");
        measure.font = "700 " + size + "px Fredoka Local";
        let ascent = 0;
        let descent = 0;
        for (const ch of chars) {
          const metrics = measure.measureText(ch);
          ascent = Math.max(ascent, Math.ceil(metrics.actualBoundingBoxAscent || size * 0.8));
          descent = Math.max(descent, Math.ceil(metrics.actualBoundingBoxDescent || size * 0.22));
        }

        const padding = Math.max(3, Math.ceil(size * 0.12));
        const lineHeight = ascent + descent + padding * 2;
        const sizeAtlas = { lineHeight, ascent, descent, glyphs: {} };

        for (const ch of chars) {
          const metrics = measure.measureText(ch);
          const left = Math.ceil(metrics.actualBoundingBoxLeft || 0);
          const right = Math.ceil(metrics.actualBoundingBoxRight || metrics.width || size * 0.4);
          const width = Math.max(1, right + left + padding * 2);
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = lineHeight;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.clearRect(0, 0, width, lineHeight);
          ctx.font = "700 " + size + "px Fredoka Local";
          ctx.textBaseline = "alphabetic";
          ctx.fillStyle = "#fff";
          ctx.fillText(ch, padding + left, padding + ascent);
          const rgba = ctx.getImageData(0, 0, width, lineHeight).data;
          const alpha = new Uint8Array(width * lineHeight);
          for (let i = 0, j = 3; i < alpha.length; i += 1, j += 4) alpha[i] = rgba[j];
          let binary = "";
          for (let i = 0; i < alpha.length; i += 0x8000) {
            binary += String.fromCharCode(...alpha.slice(i, i + 0x8000));
          }
          sizeAtlas.glyphs[ch] = {
            w: width,
            h: lineHeight,
            a: Math.ceil(metrics.width || width),
            b: btoa(binary),
          };
        }
        atlas.sizes[size] = sizeAtlas;
      }
      return atlas;
    })()
  `;
}

async function main() {
  const fontDataUrl = `data:font/woff2;base64,${(await readFile(fontFile)).toString("base64")}`;
  const port = await freePort();
  const chrome = spawn(chromePath, [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      `--remote-debugging-port=${port}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "ignore"] });

  try {
    await waitForChrome(port);
    const target = await httpJson(port, `/json/new?${encodeURIComponent("about:blank")}`, "PUT");
    const page = new CdpPage(target.webSocketDebuggerUrl);
    const result = await page.send("Runtime.evaluate", {
      expression: generationSource(fontDataUrl),
      awaitPromise: true,
      returnByValue: true,
    });
    page.close();
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
      throw new Error(description || "Font atlas generation failed");
    }

    const moduleText = [
      "// Generated by tools/generate-ogp-font-atlas.mjs. Do not edit by hand.",
      `export const OGP_FONT_ATLAS = ${JSON.stringify(result.result.value)};`,
      "",
    ].join("\n");
    await mkdir(path.dirname(outFile), { recursive: true });
    await writeFile(outFile, moduleText);
    console.log(`Wrote ${path.relative(repoRoot, outFile)}`);
  } finally {
    chrome.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
