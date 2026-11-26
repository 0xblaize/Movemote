// Host-side relay client.
//
// Dials the public relay, registers this machine's ID, answers password
// challenges, and applies accepted controllers' commands to the real cursor.
// The relay never sees whether a password is correct — we check it here.

const WebSocket = require('ws');
const input = require('./input');

function createRelayClient({ relayUrl, id, getPassword, getScreen, onSession, onStatus }) {
  let ws = null;
  let stopped = false;
  const authorized = new Set(); // cids that passed the password check
  let posTimer = null;

  function connect() {
    if (stopped) return;
    const url = `${relayUrl.replace(/\/$/, '')}/ws?role=host`;
    ws = new WebSocket(url);

    ws.on('open', () => {
      onStatus?.({ relay: 'connected' });
      ws.send(JSON.stringify({ t: 'register', id }));
    });

    ws.on('message', async (raw) => {
      let m;
      try { m = JSON.parse(raw.toString()); } catch { return; }

      if (m.t === 'registered') { onStatus?.({ relay: 'registered', id: m.id }); return; }
      if (m.t === 'error') { onStatus?.({ relay: 'error', msg: m.msg }); return; }

      if (m.t === 'auth') {
        const ok = String(m.password || '') === String(getPassword() || '');
        if (ok) { authorized.add(m.cid); onSession?.({ type: 'join', cid: m.cid, name: m.name, count: authorized.size }); }
        else { onSession?.({ type: 'reject', name: m.name }); }
        ws.send(JSON.stringify({ t: 'authResult', cid: m.cid, ok, screen: getScreen?.() || null }));
        return;
      }

      if (m.t === 'bye') { authorized.delete(m.cid); onSession?.({ type: 'leave', cid: m.cid, count: authorized.size }); return; }

      if (m.t === 'cmd') {
        if (!authorized.has(m.cid)) return; // password never accepted
        const c = m.cmd || {};
        try {
          switch (c.t) {
            case 'move': await input.moveBy(c.dx || 0, c.dy || 0); break;
            case 'moveAbs': await input.moveToNormalized(c.x || 0, c.y || 0); break;
            case 'down': await input.buttonDown(c.button); break;
            case 'up': await input.buttonUp(c.button); break;
            case 'click': await input.click(c.button, !!c.double); break;
            case 'scroll': await input.scroll(c.dx || 0, c.dy || 0); break;
          }
        } catch (e) { onStatus?.({ relay: 'cmd-error', msg: String(e) }); }
      }
    });

    ws.on('close', () => {
      authorized.clear();
      onStatus?.({ relay: 'disconnected' });
      onSession?.({ type: 'leave', count: 0 });
      if (!stopped) setTimeout(connect, 2000); // auto-reconnect
    });
    ws.on('error', () => { /* close handler reconnects */ });
  }

  // Push the real cursor position back to accepted controllers for sync.
  posTimer = setInterval(async () => {
    if (!ws || ws.readyState !== 1 || authorized.size === 0) return;
    try {
      const p = await input.getPosition();
      for (const cid of authorized) ws.send(JSON.stringify({ t: 'to', cid, msg: { t: 'pos', x: p.x, y: p.y } }));
    } catch { /* no display */ }
  }, 120);

  function stop() { stopped = true; clearInterval(posTimer); try { ws?.close(); } catch {} }

  connect();
  return { stop, get count() { return authorized.size; } };
}

module.exports = { createRelayClient };
