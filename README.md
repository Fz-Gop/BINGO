# Codex Project 1

## Operational Constraints (Must Follow)
- All actions and commands must be confined to this project directory: `/Users/xalpha/Desktop/Placement/Learn/Agent built apps/Codex - Project 1`.
- Do not read, write, or modify anything outside this directory.
- Do not change system-wide or user-wide configuration (e.g., Git config, shell config like `.zshrc`, SSH keys, or any global settings).
- Never run commands that affect other locations on the system.

These constraints apply to all work on this project and must be re-checked before running any command.

## Local-Only Node/NPM (No Global Installs)
This repo is set up to run **without** relying on any globally installed Node.js or npm.

- Local Node runtime lives in `.tools/node` (kept inside this folder).
- `./npm` is a project-local wrapper that runs npm using the local Node runtime.
- npm cache and prefix are forced into this repo via `.npmrc`.

### If Node Is Not Installed Yet (Inside This Repo)
Run:
```sh
./scripts/bootstrap-node.sh
```

If macOS blocks the downloaded Node binary, run (still inside this repo only):
```sh
xattr -dr com.apple.quarantine .tools/node
```

## Running The App (Dev vs Play)
### Dev (best while building)
1. Install dependencies (workspace install):
```sh
./npm install
```
2. Start dev servers (UI on port 5173, game server on port 3000):
```sh
./npm run dev
```
Other laptop opens: `http://<HOST_IP>:5173`
The UI will connect to the game server at `http://<HOST_IP>:3000` automatically.

### Play (single port, easier to share)
1. Install dependencies:
```sh
./npm install
```
2. Build UI and run the server (serves UI from server):
```sh
./npm run play
```
Other laptop opens: `http://<HOST_IP>:3000`

## Public Hosting Guidance
### Recommended Persistent Option
For a free public URL that does not require your laptop to stay on, deploy the Node server to Render.

- Render web services: `https://render.com/docs/web-services`
- Render WebSockets: `https://render.com/docs/websocket`
- Render free tier overview: `https://render.com/docs/free`

This project already fits that model because the production server serves the built client and Socket.IO from one process.

### Fastest Temporary Option
For quick remote testing without deployment, use Cloudflare Quick Tunnel while `./npm run play` is running locally.

- Quick Tunnels: `https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/`
- Cloudflare Tunnel overview: `https://developers.cloudflare.com/tunnel/`

This is useful for short-lived testing, but the machine hosting the game must stay online.
