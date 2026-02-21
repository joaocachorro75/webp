import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import axios from "axios";
import https from "https";
import http from "http";

const db = new Database("xtream.db");

// Create agents that ignore SSL certificate errors and keep connections alive
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true
});

const httpAgent = new http.Agent({
  keepAlive: true
});

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Middleware to check admin password
  const adminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const password = req.headers["x-admin-password"];
    const expectedPassword = process.env.ADMIN_PASSWORD || "admin";
    
    if (password !== expectedPassword) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  // API Routes
  
  // Get all servers
  app.get("/api/servers", (req, res) => {
    const servers = db.prepare("SELECT * FROM servers").all();
    res.json(servers);
  });

  // Add a server (Protected)
  app.post("/api/servers", adminAuth, (req, res) => {
    const { name, url } = req.body;
    if (!name || !url) return res.status(400).json({ error: "Name and URL are required" });
    
    const cleanUrl = url.replace(/\/$/, "");
    const info = db.prepare("INSERT INTO servers (name, url) VALUES (?, ?)").run(name, cleanUrl);
    res.json({ id: info.lastInsertRowid, name, url: cleanUrl });
  });

  // Delete a server (Protected)
  app.delete("/api/servers/:id", adminAuth, (req, res) => {
    db.prepare("DELETE FROM servers WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Proxy Xtream API to avoid CORS
  app.all("/api/proxy", async (req, res) => {
    const { targetUrl, ...params } = req.query;
    
    if (!targetUrl) return res.status(400).json({ error: "targetUrl is required" });

    try {
      const response = await axios({
        method: req.method,
        url: targetUrl as string,
        params: params,
        data: req.body,
        timeout: 15000,
        httpsAgent,
        httpAgent
      });
      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error("Proxy error:", error.message);
      res.status(error.response?.status || 500).json({ 
        error: "Failed to fetch from Xtream server",
        details: error.message 
      });
    }
  });

  // Stream Proxy to bypass CORS for video
  app.get("/api/stream", async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send("URL is required");

    const targetUrl = url as string;
    const isM3U8 = targetUrl.toLowerCase().split('?')[0].endsWith(".m3u8");

    try {
      if (isM3U8) {
        // For manifests, we need to rewrite URLs to proxy them too
        const response = await axios.get(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          },
          httpsAgent,
          httpAgent,
          timeout: 10000
        });

        let content = response.data;
        const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

        const lines = content.split('\n');
        const rewrittenLines = lines.map((line: string) => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            let absoluteUrl = trimmed;
            if (!trimmed.startsWith('http')) {
              try {
                absoluteUrl = new URL(trimmed, baseUrl).href;
              } catch (e) {
                return line;
              }
            }
            return `/api/stream?url=${encodeURIComponent(absoluteUrl)}`;
          }
          return line;
        });

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.send(rewrittenLines.join('\n'));
      }

      // For segments and VOD, use axios with stream response
      const response = await axios({
        method: 'get',
        url: targetUrl,
        responseType: 'stream',
        httpsAgent,
        httpAgent,
        maxRedirects: 5,
        timeout: 60000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          ...(req.headers.range ? { 'Range': req.headers.range } : {})
        },
        validateStatus: () => true
      });

      // Forward status
      res.status(response.status);
      
      // Forward essential headers only
      const essentialHeaders = [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges'
      ];

      essentialHeaders.forEach(h => {
        if (response.headers[h]) {
          res.setHeader(h, response.headers[h]);
        }
      });

      // Always allow CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Expose-Headers', '*');

      response.data.pipe(res);

      req.on('close', () => {
        if (response.data && response.data.destroy) {
          response.data.destroy();
        }
      });

    } catch (error: any) {
      const status = error.response?.status || 500;
      const message = error.message;
      console.error(`Stream proxy error (${status}):`, message);
      
      if (error.response) {
        console.error("Target server response headers:", error.response.headers);
      }

      if (!res.headersSent) {
        res.status(status).send(`Error proxying stream: ${message}`);
      }
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    const distPath = path.resolve(__dirname, "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.resolve(distPath, "index.html"));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
