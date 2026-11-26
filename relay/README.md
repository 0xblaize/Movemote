# Movemote relay

The piece in the middle. Both the host PC and the controller dial out to this
server, so two machines in different countries can connect by **ID + password**
with no port forwarding and no VPN.

It never checks the password itself — it forwards the password to the host and
the host decides. A compromised relay still can't authorize a session.

## Run locally (for testing)

```bash
cd relay
npm install
npm start          # listens on :9000
```

Then point the host app at it: `MOVEMOTE_RELAY=ws://localhost:9000 npm start`
(from the repo root).

## Deploy (so it works from anywhere)

You need this on a public host **with TLS**, so connections are `wss://`.
Browsers block `ws://` from an `https://` page, and you want the password
encrypted in transit anyway. Pick one:

**Fly.io**
```bash
cd relay
fly launch --dockerfile Dockerfile   # accept defaults, it gives you https://<app>.fly.dev
```

**Render / Railway** — new Web Service from this repo, root directory `relay`,
it autodetects the Dockerfile. You get an `https://…` URL.

**Bare VPS** — run the Docker image and put Caddy in front for automatic TLS:
```
yourrelay.example.com {
    reverse_proxy localhost:9000
}
```

## Point the apps at your relay

- Host PC: start with `MOVEMOTE_RELAY=wss://your-relay.example.com npm start`
  (or bake it into `RELAY_URL` in `src/main/index.js` before packaging).
- Controller: just open `https://your-relay.example.com` in any browser, type
  the PC's ID and password.

## Health check

`GET /healthz` → `ok` (for the platform's health probe).
