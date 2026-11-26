// Real system cursor control.
//
// We use the OS input-injection path (nut-js -> libnut -> CGEvent on macOS,
// SendInput on Windows). This moves the one real cursor. It does NOT register
// a second virtual pointer, so the host's physical mouse and the remote share
// the same cursor and stay in sync by definition.
//
// Set MOVEMOTE_MOCK=1 to run the protocol without touching a real cursor
// (useful on headless/CI machines with no display).

const MOCK = process.env.MOVEMOTE_MOCK === '1';

let nut = null;
let Point = null;
let Button = null;

if (!MOCK) {
  const n = require('@nut-tree-fork/nut-js');
  nut = n;
  Point = n.Point;
  Button = n.Button;
  // Lowest latency: no artificial delays between actions.
  nut.mouse.config.autoDelayMs = 0;
  nut.keyboard.config.autoDelayMs = 0;
}

const BUTTONS = MOCK
  ? { left: 0, middle: 1, right: 2 }
  : { left: Button.LEFT, middle: Button.MIDDLE, right: Button.RIGHT };

// Mock cursor state so the server/protocol can be exercised with no display.
let mockPos = { x: 0, y: 0 };
let bounds = { width: 1920, height: 1080 };

function setBounds(width, height) {
  bounds = { width, height };
}

function currentBounds() {
  return { width: bounds.width, height: bounds.height };
}

function clamp(x, y) {
  return {
    x: Math.max(0, Math.min(bounds.width - 1, Math.round(x))),
    y: Math.max(0, Math.min(bounds.height - 1, Math.round(y))),
  };
}

async function getPosition() {
  if (MOCK) return { ...mockPos };
  const p = await nut.mouse.getPosition();
  return { x: p.x, y: p.y };
}

async function setPosition(x, y) {
  const c = clamp(x, y);
  if (MOCK) {
    mockPos = c;
    return c;
  }
  await nut.mouse.setPosition(new Point(c.x, c.y));
  return c;
}

// Relative move (trackpad feel): read the current real position, apply the
// delta, clamp, set. Reading each time keeps us in sync with any physical
// movement the host user made between packets.
async function moveBy(dx, dy) {
  const cur = await getPosition();
  return setPosition(cur.x + dx, cur.y + dy);
}

// Absolute move from normalized 0..1 screen coordinates (screen-mirror mode).
async function moveToNormalized(nx, ny) {
  return setPosition(nx * bounds.width, ny * bounds.height);
}

async function buttonDown(name = 'left') {
  if (MOCK) return;
  await nut.mouse.pressButton(BUTTONS[name] ?? BUTTONS.left);
}

async function buttonUp(name = 'left') {
  if (MOCK) return;
  await nut.mouse.releaseButton(BUTTONS[name] ?? BUTTONS.left);
}

async function click(name = 'left', double = false) {
  if (MOCK) return;
  const b = BUTTONS[name] ?? BUTTONS.left;
  await nut.mouse.click(b);
  if (double) await nut.mouse.click(b);
}

async function scroll(dx, dy) {
  if (MOCK) return;
  if (dy) dy > 0 ? await nut.mouse.scrollDown(dy) : await nut.mouse.scrollUp(-dy);
  if (dx) dx > 0 ? await nut.mouse.scrollRight(dx) : await nut.mouse.scrollLeft(-dx);
}

module.exports = {
  MOCK,
  setBounds,
  currentBounds,
  getPosition,
  setPosition,
  moveBy,
  moveToNormalized,
  buttonDown,
  buttonUp,
  click,
  scroll,
};
