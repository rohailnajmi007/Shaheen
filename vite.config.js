import { defineConfig } from 'vite';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Windows: the dev server could see the project as both "c:\..." and "C:\...", serve
// the same module under two URLs and load it twice (empty sprite tables: no particles,
// no crash debris). Pin the root to the real path so every import uses one URL.
export default defineConfig({
  root: realpathSync.native(fileURLToPath(new URL('.', import.meta.url))),
});
