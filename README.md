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
