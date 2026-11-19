# Deployment: Vercel

**Live:** https://shaheen-green.vercel.app (Vercel project `shaheen`, first deployed 2026-11-17). `build/web/.vercel/` holds the project link. Update it by double-clicking `deploy.bat`.

For now the game is deployed **only to Vercel**, as a static website. Don't set up other hosts.

A Godot **Web export** is just a folder of static files (`index.html`, `.js`, `.wasm`, `.pck`). Vercel serves that folder; there's no server code and no build step on Vercel's side. Godot does the "build" on the owner's machine.

## 1. One-time setup in Godot

1. Editor → Manage Export Templates → **Download and Install** (must match the Godot version, 4.7.2). They land in `%APPDATA%/Godot/export_templates/4.7.2.stable/`.
2. The **Web export preset is already in the repo** (`export_presets.cfg`, preset name `"Web"`), so Project → Export shows it ready. For reference, its settings are:
   - **Thread Support: OFF.** The game then runs without special cross-origin isolation headers (SharedArrayBuffer), which keeps hosting simple and works better on phones.
   - Export path: `build/web/index.html` (the HTML file **must** be called `index.html`).
   - Renderer must be **Compatibility** (Project Settings). Forward+ / Mobile won't run on the web.
   - VRAM compression: keep "For Desktop" on.
4. Add `build/` to `.gitignore` (exports aren't committed. We deploy the folder directly with the Vercel CLI).

## 2. Test locally first

- Click the **Remote Debug / Run in Browser** button (top right of the Godot editor). Godot serves the game locally and opens it in the browser.
- Double-clicking `index.html` will **not** work (browsers block it from `file://`).

## 3. One-time Vercel setup

1. Create a free Vercel account (Hobby plan) at vercel.com.
2. Install Node.js, then the CLI: `npm i -g vercel`
3. Log in: `vercel login`

## 4. Deploy

From the project root, after exporting to `build/web`:

```
vercel deploy build/web --prod
```

The first run asks some setup questions. Link it to a new project (e.g. `shaheen-prototype`), framework preset **Other**, **no** build command, output directory `.` (the folder itself). This creates `build/web/.vercel/` with the project link. If the export folder is ever wiped, run the command again and link it to the same existing project.

After that, every update is:
1. Export from Godot (Project → Export → Web → Export Project → `build/web/index.html`).
2. `vercel deploy build/web --prod`

**Shortcut: double-click `deploy.bat`** in the project folder (Windows). It runs the export and then the deploy command below, and stops with a message if the export fails (usually: templates not installed). The commands it runs:
```
godot --headless --export-release "Web" build/web/index.html
vercel deploy build/web --prod
```
(`"Web"` must match the export preset name. The `godot` command must be on PATH.)

## 5. Sharing with friends

- Use the **production URL** (e.g. `https://shaheen-prototype.vercel.app`). Anyone with the link can play. No install, no account.
- **Preview** deployments (without `--prod`) are protected by Vercel login by default, so friends can't open them. Always send the production URL.
- The production URL is public to anyone who has it. Password protection is a paid Vercel feature, so for a private prototype just don't post the link publicly.

## 6. Optional `vercel.json`

Not required with Thread Support off. If loading feels slow, caching can be tuned later by placing a `vercel.json` in `build/web/` (and re-creating it after exports, or generating it from the deploy script). Leave this until there's a reason.

## 7. Notes and gotchas

- If the editor's template download stalls, only two files are needed for this preset: `web_nothreads_debug.zip` and `web_nothreads_release.zip` in `%APPDATA%/Godot/export_templates/4.7.2.stable/` (both from the official `Godot_v4.7.2-stable_export_templates.tpz`).
- `vercel link` writes a `.env.local` (an access token) into the folder it's run in. `deploy.bat` deletes it from `build/web` before uploading so it never ends up on the public site.

- First load downloads the engine (roughly 10–40 MB). Keep assets small.
- Browsers block audio until the player clicks or presses a key. The start screen handles this naturally.
- Web saves (later) go to browser storage via `user://`.
- Test on Chrome desktop first. Phone browsers (especially iOS Safari) can be less reliable for WebGL, and mobile isn't a target yet anyway.
