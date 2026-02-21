import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";
import axios from "axios";
import https from "https";
import http from "http";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create agents that ignore SSL certificate errors and keep connections alive
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true
});

const httpAgent = new http.Agent({
  keepAlive: true
});

// ============ PERSISTENT DATA STORAGE ============
// Use /data directory for persistent storage (Docker volume)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const SERVERS_FILE = path.join(DATA_DIR, "servers.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ============ MULTER CONFIG FOR UPLOADS ============
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const prefix = file.fieldname === 'logo' ? 'logo' : 'favicon';
    cb(null, `${prefix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|ico|svg|webp/;
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;
    
    if (allowedTypes.test(ext) || mime.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas'));
    }
  }
});

// ============ TYPES ============
interface Server {
  id: number;
  name: string;
  url: string;
}

interface Session {
  id: string;
  user: string;
  serverName: string;
  serverUrl: string;
  loginTime: number;
  lastActivity: number;
  ipAddress?: string;
}

interface AppConfig {
  appName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
}

// ============ DATA HELPERS ============
// Load servers from JSON file
function loadServers(): Server[] {
  try {
    if (fs.existsSync(SERVERS_FILE)) {
      const data = fs.readFileSync(SERVERS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("[Storage] Error loading servers:", err);
  }
  return [];
}

// Save servers to JSON file
function saveServers(servers: Server[]) {
  try {
    fs.writeFileSync(SERVERS_FILE, JSON.stringify(servers, null, 2));
    console.log(`[Storage] Saved ${servers.length} servers`);
  } catch (err) {
    console.error("[Storage] Error saving servers:", err);
  }
}

// Load sessions from JSON file
function loadSessions(): Map<string, Session> {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = fs.readFileSync(SESSIONS_FILE, "utf-8");
      const arr = JSON.parse(data);
      return new Map(arr);
    }
  } catch (err) {
    console.error("[Storage] Error loading sessions:", err);
  }
  return new Map();
}

// Save sessions to JSON file
function saveSessions(sessions: Map<string, Session>) {
  try {
    const arr = Array.from(sessions.entries());
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(arr, null, 2));
  } catch (err) {
    console.error("[Storage] Error saving sessions:", err);
  }
}

// Load app config from JSON file
function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("[Storage] Error loading config:", err);
  }
  return {
    appName: "WebTV",
    logoUrl: null,
    faviconUrl: null
  };
}

// Save app config to JSON file
function saveConfig(config: AppConfig) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log(`[Storage] Saved config: ${config.appName}`);
  } catch (err) {
    console.error("[Storage] Error saving config:", err);
  }
}

// Get current uploads
function getUploadUrl(filename: string): string {
  return `/uploads/${filename}`;
}

// ============ INITIALIZE DATA ============
let servers = loadServers();
const sessions = loadSessions();
let appConfig = loadConfig();
let nextServerId = servers.length > 0 ? Math.max(...servers.map(s => s.id)) + 1 : 1;

// Cleanup inactive sessions every 5 minutes
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes
setInterval(() => {
  const now = Date.now();
  let changed = false;
  sessions.forEach((session, id) => {
    if (now - session.lastActivity > SESSION_TIMEOUT) {
      sessions.delete(id);
      changed = true;
      console.log(`[Session] Removed inactive session: ${session.user}`);
    }
  });
  if (changed) {
    saveSessions(sessions);
  }
}, 60000); // Check every minute

async function startServer() {
  const app = express();

  app.use(express.json());

  // Serve uploads directory statically
  app.use("/uploads", express.static(UPLOADS_DIR));

  // Middleware to check admin password
  const adminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const password = req.headers["x-admin-password"];
    const expectedPassword = process.env.ADMIN_PASSWORD || "admin";
    
    if (password !== expectedPassword) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  // ============ APP CONFIG ROUTES ============
  
  // Get app config (public - for frontend)
  app.get("/api/config", (req, res) => {
    res.json({
      appName: appConfig.appName,
      logoUrl: appConfig.logoUrl,
      faviconUrl: appConfig.faviconUrl
    });
  });

  // Update app config (admin only)
  app.post("/api/config", adminAuth, (req, res) => {
    const { appName } = req.body;
    
    if (appName) {
      appConfig.appName = appName;
      saveConfig(appConfig);
    }
    
    res.json(appConfig);
  });

  // Upload logo (admin only)
  app.post("/api/config/logo", adminAuth, upload.single('logo'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado" });
    }
    
    const filename = req.file.filename;
    appConfig.logoUrl = getUploadUrl(filename);
    saveConfig(appConfig);
    
    console.log(`[Config] Logo uploaded: ${filename}`);
    res.json({ 
      success: true, 
      logoUrl: appConfig.logoUrl 
    });
  });

  // Upload favicon (admin only)
  app.post("/api/config/favicon", adminAuth, upload.single('favicon'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado" });
    }
    
    const filename = req.file.filename;
    appConfig.faviconUrl = getUploadUrl(filename);
    saveConfig(appConfig);
    
    console.log(`[Config] Favicon uploaded: ${filename}`);
    res.json({ 
      success: true, 
      faviconUrl: appConfig.faviconUrl 
    });
  });

  // ============ SERVER ROUTES ============
  
  // Get all servers
  app.get("/api/servers", (req, res) => {
    res.json(servers);
  });

  // Add a server (Protected)
  app.post("/api/servers", adminAuth, (req, res) => {
    const { name, url } = req.body;
    if (!name || !url) return res.status(400).json({ error: "Name and URL are required" });
    
    const cleanUrl = url.replace(/\/$/, "");
    const newServer: Server = { id: nextServerId++, name, url: cleanUrl };
    servers.push(newServer);
    saveServers(servers);
    console.log(`[Server] Added: ${name} (${cleanUrl})`);
    res.json(newServer);
  });

  // Delete a server (Protected)
  app.delete("/api/servers/:id", adminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    servers = servers.filter(s => s.id !== id);
    saveServers(servers);
    console.log(`[Server] Deleted ID: ${id}`);
    res.json({ success: true });
  });

  // ============ SESSION ROUTES ============

  // Create/update session (called when user logs in)
  app.post("/api/session", (req, res) => {
    const { sessionId, user, serverName, serverUrl } = req.body;
    if (!sessionId || !user) {
      return res.status(400).json({ error: "sessionId and user are required" });
    }

    const session: Session = {
      id: sessionId,
      user,
      serverName: serverName || "Unknown",
      serverUrl: serverUrl || "",
      loginTime: sessions.get(sessionId)?.loginTime || Date.now(),
      lastActivity: Date.now(),
      ipAddress: req.ip || req.socket.remoteAddress
    };

    sessions.set(sessionId, session);
    saveSessions(sessions);
    console.log(`[Session] Updated: ${user}`);
    res.json({ success: true });
  });

  // Heartbeat - keep session alive
  app.post("/api/session/heartbeat", (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const session = sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      sessions.set(sessionId, session);
      saveSessions(sessions);
    }
    res.json({ success: true });
  });

  // End session (logout)
  app.delete("/api/session/:sessionId", (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (session) {
      console.log(`[Session] Ended: ${session.user}`);
      sessions.delete(req.params.sessionId);
      saveSessions(sessions);
    }
    res.json({ success: true });
  });

  // Get active sessions (Admin only)
  app.get("/api/sessions", adminAuth, (req, res) => {
    const now = Date.now();
    const activeSessions = Array.from(sessions.values())
      .filter(s => now - s.lastActivity < SESSION_TIMEOUT)
      .map(s => ({
        id: s.id,
        user: s.user,
        serverName: s.serverName,
        loginTime: s.loginTime,
        lastActivity: s.lastActivity,
        duration: Math.floor((now - s.loginTime) / 1000),
        ipAddress: s.ipAddress
      }));
    res.json(activeSessions);
  });

  // Get session stats (Admin only)
  app.get("/api/sessions/stats", adminAuth, (req, res) => {
    const now = Date.now();
    const active = Array.from(sessions.values())
      .filter(s => now - s.lastActivity < SESSION_TIMEOUT);
    
    res.json({
      online: active.length,
      total: sessions.size,
      servers: [...new Set(active.map(s => s.serverName))]
    });
  });

  // ============ PROXY ROUTES ============

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
    const urlPath = targetUrl.toLowerCase().split('?')[0];
    const isM3U8 = urlPath.endsWith(".m3u8");

    console.log(`[Stream] Request: ${targetUrl.substring(0, 100)}...`);

    try {
      // For M3U8 manifests, rewrite URLs to proxy them
      if (isM3U8) {
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

      // For VOD and segments - use stream with HEAD request first to detect type
      const headCheck = await axios({
        method: 'head',
        url: targetUrl,
        httpsAgent,
        httpAgent,
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
        validateStatus: () => true
      }).catch(() => null);

      const contentType = headCheck?.headers?.['content-type'] || '';
      const detectedM3U8 = contentType.includes('mpegurl') || contentType.includes('m3u8');
      
      console.log(`[Stream] Content-Type: ${contentType}, Detected M3U8: ${detectedM3U8}`);

      // If server returns m3u8 content-type, treat as HLS
      if (detectedM3U8) {
        console.log(`[Stream] Detected HLS manifest via content-type, rewriting...`);
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

      // Stream the video content
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

      console.log(`[Stream] Response status: ${response.status}, Content-Type: ${response.headers['content-type']}`);

      // Forward status
      res.status(response.status);
      
      // Forward essential headers only
      const essentialHeaders = [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'cache-control'
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
      console.error(`[Stream] Proxy error (${status}):`, message);
      
      if (error.response) {
        console.error("[Stream] Target server response:", {
          status: error.response.status,
          headers: error.response.headers
        });
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

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Data directory: ${DATA_DIR}`);
    console.log(`Servers loaded: ${servers.length}`);
    console.log(`App name: ${appConfig.appName}`);
  });
}

startServer();
