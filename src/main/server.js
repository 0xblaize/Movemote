// HTTP + WebSocket server.
//
// - Serves the controller web page over the LAN (so a phone or another PC
//   can drive this host with no install).
// - Accepts control commands over WebSocket and applies them to the real
//   cursor via input.js.
// - Broadcasts the real cursor position back so controllers stay synced.
//
// Consent: a controller cannot move anything until the host has accepted the
// session (see `allowControl`). The host UI shows a visible banner whenever a
// session is active. This is deliberate — no silent/background control.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const input = require('./input');

const CONTROLLER_DIR = path.join(__dirname, '..', 'controller');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function createServer({ port = 8787, token, onEvent } = {}) {
  let allowControl = false; // flipped on only when the host accepts
  const clients = new Set();

  const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = url.pathname === '/' ? '/index.html' : url.pathname;
    const full = path.join(CONTROLLER_DIR, path.normalize(file));
    if (!full.startsWith(CONTROLLER_DIR)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(full, (err, data) => {
      if (err) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream' });
      res.end(data);
    });
  });

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  function broadcast(obj) {
    const msg = JSON.stringify(obj);
    for (const c of clients) if (c.readyState === 1) c.send(msg);
  }

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    // Simple shared-secret gate so random LAN devices can't connect.
    if (token && url.searchParams.get('token') !== token) {
      ws.close(4001, 'bad token');
      return;
    }

    const client = { ws, name: 'controller', readyState: 1 };
    clients.add(ws);
    onEvent?.({ type: 'connect', count: clients.size });

    const screen = input.currentBounds ? input.currentBounds() : null;
    ws.send(JSON.stringify({ t: 'welcome', allowControl, screen }));

    ws.on('message', async (raw) => {
      let m;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (m.t === 'hello') {
        client.name = String(m.name || 'controller').slice(0, 40);
        onEvent?.({ type: 'hello', name: client.name });
        return;
      }

      if (!allowControl) return; // locked until host accepts

      try {
        switch (m.t) {
          case 'move':
            await input.moveBy(m.dx || 0, m.dy || 0);
            break;
          case 'moveAbs':
            await input.moveToNormalized(m.x || 0, m.y || 0);
            break;
          case 'down':
            await input.buttonDown(m.button);
            break;
          case 'up':
            await input.buttonUp(m.button);
            break;
          case 'click':
            await input.click(m.button, !!m.double);
            break;
          case 'scroll':
            await input.scroll(m.dx || 0, m.dy || 0);
            break;
        }
      } catch (e) {
        onEvent?.({ type: 'error', message: String(e) });
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      onEvent?.({ type: 'disconnect', count: clients.size });
    });
  });

  // Position sync: push the real cursor position to controllers a few times a
  // second while someone is connected.
  const posTimer = setInterval(async () => {
    if (!clients.size) return;
    try {
      const p = await input.getPosition();
      broadcast({ t: 'pos', x: p.x, y: p.y });
    } catch {
      /* no display / between frames */
    }
  }, 100);

  function setAllowControl(v) {
    allowControl = !!v;
    broadcast({ t: 'state', allowControl });
    onEvent?.({ type: 'allow', allowControl });
  }

  function listen() {
    return new Promise((resolve) => httpServer.listen(port, () => resolve(port)));
  }

  function close() {
    clearInterval(posTimer);
    wss.close();
    httpServer.close();
  }

  return { listen, close, setAllowControl, get clientCount() { return clients.size; } };
}

module.exports = { createServer };

// Allow `npm run server:test` to boot the server standalone (mock cursor).
if (require.main === module) {
  const srv = createServer({ onEvent: (e) => console.log('[event]', e) });
  srv.listen().then((port) => {
    srv.setAllowControl(true);
    console.log(`Movemote test server on http://localhost:${port}  (MOCK=${input.MOCK})`);
  });
}
