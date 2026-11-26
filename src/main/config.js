// Persistent ID + session password for this host.
//
// - ID: a stable 9-digit code, generated once and saved. This is what someone
//   types to reach this PC (like a TeamViewer ID).
// - Password: regenerated every launch and kept in memory only (temporary
//   password, like TeamViewer's). You read it to whoever is connecting. Call
//   setPassword() to pin a fixed one for unattended use.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function nineDigitId() {
  // 9 digits, no leading zero.
  let s = String(1 + Math.floor(Math.random() * 9));
  for (let i = 0; i < 8; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function randomPassword() {
  // readable: no 0/O/1/l confusion
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[crypto.randomInt(alphabet.length)];
  return s;
}

function load(userDataDir) {
  const file = path.join(userDataDir, 'movemote.json');
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }

  if (!data.id) {
    data.id = nineDigitId();
    try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch { /* best effort */ }
  }

  let password = data.fixedPassword || randomPassword();

  return {
    id: data.id,
    getPassword: () => password,
    setPassword: (p) => { password = String(p); },
    idPretty: () => data.id.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3'),
  };
}

module.exports = { load };
