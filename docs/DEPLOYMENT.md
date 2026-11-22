# Deployment: Vercel

**Live:** https://shaheen-paf.vercel.app (Vercel project `shaheen`, first deployed 2026-11-17; renamed from shaheen-green.vercel.app on 2026-11-22 by the owner: added as a project domain with `vercel domains add shaheen-paf.vercel.app shaheen`, so every production deploy updates it. The old address still works).
Deploying publishes publicly: **only when the owner asks.** Update it by double-clicking `deploy.bat`.

For now the game is deployed **only to Vercel**, as a static website. Don't set up other hosts.

The game is built on the owner's machine with Vite (`npm run build`), which writes a
folder of static files to `dist/` (`index.html`, one JS file, one CSS file, sprites,
font). Vercel serves that folder: no server code, no build step on Vercel's side.

(Until 2026-11 this was a Godot web export in `build/web/`. That folder and its
instructions are obsolete.)

## 1. One-time setup

1. Node.js 22+ (includes npm). Then in the project folder: `npm install`.
2. Vercel CLI: `npm i -g vercel`, then `vercel login`.
3. Link the folder to the existing project (once per PC):
   `vercel link --project shaheen` in the project root. This writes `.vercel/project.json`
   (git-ignored). It may also write `.env.local` (an access token): also git-ignored,
   and it must never be uploaded.

## 2. Test locally first

- `npm run dev` and open http://localhost:5173 (changes reload live).
- For the real build: `npm run build` then `npm run preview`.
- Double-clicking `dist/index.html` will not work (browsers block modules from `file://`).

## 3. Deploy

**Double-click `deploy.bat`** in the project folder (Windows). It:
1. runs `npm install` if `node_modules/` is missing,
2. runs `npm run build` and stops with a message if it fails,
3. copies the saved link `.vercel/` into `dist/` (every build empties `dist/`),
4. deletes `dist\.env.local` if present,
5. runs `vercel deploy dist --prod --yes`.

By hand, the same thing:
```
npm run build
xcopy /e /i /y .vercel dist\.vercel
vercel deploy dist --prod
```

If the link is ever lost, `vercel link --project shaheen` again (pick the existing
project, never create a new one, or the URL changes).

Don't connect the GitHub repo to Vercel's automatic Git deployments: every push would
then publish, and we only deploy when the owner asks.

## 4. Sharing with friends

- Use the **production URL** (https://shaheen-paf.vercel.app). Anyone with the link can play. No install, no account.
- **Preview** deployments (without `--prod`) are protected by Vercel login by default, so friends can't open them. Always send the production URL.
- The production URL is public to anyone who has it. Password protection is a paid Vercel feature, so for a private prototype just don't post the link publicly.

## 5. Notes and gotchas

- The build is small (about 37 KB gzipped JS + 5 KB CSS + sprites), so it loads fast. Keep assets small.
- Browsers block audio until the player clicks or presses a key. The start screen handles this (`sound.unlock()`).
- Saves live in the browser's `localStorage` (per browser, per device).
- `vite.config` doesn't exist: defaults are fine (site served from `/`). If the game
  is ever served from a sub-path, set Vite's `base` and keep using `import.meta.env.BASE_URL` for asset paths.
- Test on Chrome desktop first, then a phone browser.
