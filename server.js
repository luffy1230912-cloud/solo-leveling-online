const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(",") : "*", methods: ["GET", "POST", "PUT"] },
  transports: ["websocket", "polling"]
});
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("Defina JWT_SECRET com pelo menos 32 caracteres nas variáveis de ambiente.");
  process.exit(1);
}

const DB_FILE = path.join(__dirname, "data.json");
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { return { users: {}, saves: {} }; }
}
let db = loadDB();
function persist() {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}
// CORS para a API HTTP (cadastro, login e salvamento).
// O CORS do Socket.IO, configurado acima, não libera estas rotas Express.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: "1mb" }));
app.get("/", (_req, res) => res.json({ name: "Solo Leveling 2D Online Server", status: "ok" }));
const players = new Map();
app.get("/health", (_req, res) => res.json({ status: "ok", online: players.size }));

function auth(req, res, next) {
  const raw = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  try {
    const payload = jwt.verify(raw, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "Sessão inválida. Entre novamente." });
  }
}
function validCredentials(email, password) {
  return typeof email === "string" && email.length <= 180 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    typeof password === "string" && password.length >= 8 && password.length <= 100;
}
app.post("/api/register", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!validCredentials(email, password)) return res.status(400).json({ error: "Informe um e-mail válido e senha de 8 a 100 caracteres." });
    const key = email.trim().toLowerCase();
    if (db.users[key]) return res.status(409).json({ error: "Este e-mail já possui uma conta." });
    const passwordHash = await bcrypt.hash(password, 12);
    db.users[key] = { id: key, passwordHash, createdAt: Date.now() };
    persist();
    const token = jwt.sign({ sub: key }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token });
  } catch { res.status(500).json({ error: "Não foi possível criar a conta." }); }
});
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const key = typeof email === "string" ? email.trim().toLowerCase() : "";
    const user = db.users[key];
    if (!user || typeof password !== "string" || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "E-mail ou senha incorretos." });
    }
    const token = jwt.sign({ sub: key }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token });
  } catch { res.status(500).json({ error: "Não foi possível entrar." }); }
});
app.get("/api/save", auth, (req, res) => res.json(db.saves[req.userId] || {}));
app.put("/api/save", auth, (req, res) => {
  const body = req.body || {};
  if (!body.save || typeof body.save !== "object" || Array.isArray(body.save)) return res.status(400).json({ error: "Progresso inválido." });
  db.saves[req.userId] = { save: body.save, appearance: body.appearance || {}, updatedAt: Date.now() };
  persist();
  res.json({ ok: true });
});

function publicPlayer(p) {
  return { id: p.id, name: p.name, x: p.x, y: p.y, facing: p.facing, appearance: p.appearance };
}
function broadcastPlayers() {
  io.emit("world:players", [...players.values()].map(publicPlayer));
}
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    const payload = jwt.verify(token, JWT_SECRET);
    socket.userId = payload.sub;
    next();
  } catch { next(new Error("Faça login para entrar no mundo online.")); }
});
io.on("connection", socket => {
  socket.on("world:join", data => {
    const name = String(data && data.name || "Caçador").slice(0, 18);
    const appearance = data && data.appearance && typeof data.appearance === "object" ? data.appearance : {};
    const p = { id: socket.id, userId: socket.userId, name, appearance, x: 0, y: 0, facing: 0 };
    players.set(socket.id, p);
    socket.emit("world:players", [...players.values()].filter(x => x.id !== socket.id).map(publicPlayer));
    socket.broadcast.emit("player:joined", publicPlayer(p));
    broadcastPlayers();
  });
  socket.on("player:move", data => {
    const p = players.get(socket.id);
    if (!p || !data) return;
    const x = Number(data.x), y = Number(data.y), facing = Number(data.facing);
    if (![x, y, facing].every(Number.isFinite) || Math.abs(x) > 100000 || Math.abs(y) > 100000) return;
    p.x = x; p.y = y; p.facing = facing;
    socket.broadcast.volatile.emit("player:moved", publicPlayer(p));
  });
  socket.on("disconnect", () => {
    const p = players.get(socket.id);
    if (p) { players.delete(socket.id); socket.broadcast.emit("player:left", { id: socket.id }); broadcastPlayers(); }
  });
});
server.listen(PORT, () => console.log(`Solo Leveling Online server listening on ${PORT}`));
