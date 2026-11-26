// Movemote relay.
//
// A small always-on server that lets two machines in different places connect
// by ID + password, without either knowing the other's IP. Both the host and
// the controller make OUTBOUND connections to this server, so it works through
// NAT and firewalls.
//
// Trust model: the relay is a dumb pipe. It never stores or checks the
// password itself — it forwards the controller's password to the HOST, and the
// host decides. So a compromised relay still can't authorize a session.
//
// Deploy this on any public host (Fly.io, Render, Railway, a VPS). Put it
// behind TLS so connections are wss:// (all those platforms give you TLS; for a
// bare VPS use a reverse proxy like Caddy). See relay/README.md.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 9000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const hosts = new Map();       // id -> host ws
const controllers = new Map(); // cid -> { ws, hostId, authorized }

const httpServer = http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200).end('ok'); return; }
  const url = new URL(req.url, 'http://localhost');
  const file = url.pathname === '/' ? '/index.html' : url.pathname;
  const full = path.join(PUBLIC_DIR, path.normalize(file));
  if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403).end(); return; }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

function send(ws, obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

wss.on('connection', (ws, req) => {
  const role = new URL(req.url, 'http://localhost').searchParams.get('role');
  ws.role = role;
  ws.cid = null;
  ws.hostId = null;

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }

    // ---- HOST side ----
    if (role === 'host') {
      if (m.t === 'register') {
        const id = String(m.id || '').replace(/\D/g, '').slice(0, 12);
        if (!id) { send(ws, { t: 'error', msg: 'bad id' }); return; }
        const prev = hosts.get(id);
        if (prev && prev !== ws) send(prev, { t: 'error', msg: 'registered elsewhere' });
        hosts.set(id, ws);
        ws.hostId = id;
        send(ws, { t: 'registered', id });
        return;
      }
      if (m.t === 'authResult') {
        const c = controllers.get(m.cid);
        if (!c) return;
        if (m.ok) { c.authorized = true; send(c.ws, { t: 'joined', screen: m.screen || null }); }
        else { send(c.ws, { t: 'denied' }); }
        return;
      }
      if (m.t === 'to') { // host -> controller (e.g. cursor position)
        const c = controllers.get(m.cid);
        if (c) send(c.ws, { t: 'msg', msg: m.msg });
        return;
      }
      return;
    }

    // ---- CONTROLLER side ----
    if (m.t === 'join') {
      const id = String(m.id || '').replace(/\D/g, '').slice(0, 12);
      const host = hosts.get(id);
      if (!host) { send(ws, { t: 'nohost' }); return; }
      ws.cid = crypto.randomBytes(6).toString('hex');
      ws.hostId = id;
      controllers.set(ws.cid, { ws, hostId: id, authorized: false });
      send(host, { t: 'auth', cid: ws.cid, password: String(m.password || ''), name: String(m.name || 'controller').slice(0, 40) });
      return;
    }
    if (m.t === 'cmd') {
      const c = controllers.get(ws.cid);
      if (!c || !c.authorized) return;        // password not accepted yet
      const host = hosts.get(c.hostId);
      if (host) send(host, { t: 'cmd', cid: ws.cid, cmd: m.cmd });
      return;
    }
  });

  ws.on('close', () => {
    if (ws.role === 'host' && ws.hostId && hosts.get(ws.hostId) === ws) {
      hosts.delete(ws.hostId);
      // tell any controllers bound to this host
      for (const [cid, c] of controllers) if (c.hostId === ws.hostId) { send(c.ws, { t: 'hostgone' }); controllers.delete(cid); }
    }
    if (ws.role !== 'host' && ws.cid) {
      const c = controllers.get(ws.cid);
      if (c) { const host = hosts.get(c.hostId); if (host) send(host, { t: 'bye', cid: ws.cid }); }
      controllers.delete(ws.cid);
    }
  });
});

httpServer.listen(PORT, () => console.log(`Movemote relay on :${PORT}`));

module.exports = { httpServer, wss, hosts, controllers };
