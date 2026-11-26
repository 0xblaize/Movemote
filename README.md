# Movemote

Remote mouse control for PC and Mac. The host runs an Electron app; a phone or
another computer on the same network opens a page and drives the host's **real
system cursor**.

## How cursor control works

Input is injected through the OS APIs (`nut-js` → `SendInput` on Windows,
`CGEvent` on macOS). That moves the one real cursor — it does **not** create a
second virtual pointer. The host's physical mouse and the remote share the same
cursor, so they stay in sync.

## Consent

Control is **off** until the host clicks **Allow control**. While a session is
active the host window shows a green `SESSION ACTIVE` banner and the tray tooltip
changes. There is no hidden/background mode.

## Run (dev)

```bash
npm install
npm start
```

The host window shows a QR code and a URL like `http://192.168.x.x:8787/?token=…`.
Open it on your phone or another computer, then click **Allow control** on the host.

- drag on the pad → move cursor
- tap → left click
- two fingers → scroll
- buttons → left / right click

## macOS permission

macOS requires **System Settings → Privacy & Security → Accessibility** to allow
the app to control the cursor. Grant it to Movemote (or to your terminal/Electron
during dev) or injection is silently ignored by the OS.

## Test the protocol without a display

```bash
npm run server:test   # MOCK cursor, no real movement
```

## Layout

```
src/main/index.js    Electron main: window, tray, screen size, consent gate
src/main/server.js   HTTP (controller page) + WebSocket (commands) + pos sync
src/main/input.js    Real cursor control via nut-js (MOVEMOTE_MOCK=1 to stub)
src/renderer/        Host window UI
src/controller/      Trackpad page served to phone / second computer
```

## Roadmap

- Phase 2: screen video streaming (capture + encode + stream) for a full remote
  desktop view. Separate from cursor control; not built yet.
- Keyboard input relay.
- Absolute / screen-mirror pointer mode (`moveAbs` protocol message already
  supported server-side).
