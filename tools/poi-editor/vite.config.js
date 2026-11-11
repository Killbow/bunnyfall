// The World Builder's own Vite app. `npm run poi-editor` serves it, `npm run build:poi-editor` builds it.
// The game's vite.config.js does not know it. It serves ARENA2 at /arena2 the way the game's dev server does.

import { defineConfig } from 'vite';
import { createReadStream, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

/** ARENA2 files by name, whatever case the disk keeps them in. The data is never built into the app. */
function arena2Server() {
  const root = process.env.ARENA2_PATH || '/home/claude/dfdata/arena2';
  let byUpper = null;
  const onDisk = (name) => {
    if (!byUpper) {
      byUpper = new Map();
      try { for (const f of readdirSync(root)) byUpper.set(f.toUpperCase(), f); } catch { /* no folder: every request falls through */ }
    }
    return byUpper.get(name.toUpperCase()) ?? name;
  };
  const isFile = (p) => statSync(p, { throwIfNoEntry: false })?.isFile() === true;
  return {
    name: 'poi-editor-arena2',
    configureServer(server) {
      server.middlewares.use('/arena2', (req, res, next) => {
        const name = decodeURIComponent(req.url.slice(1).split('?')[0]);
        if (!/^[A-Za-z0-9._-]+$/.test(name)) return next();
        const path = join(root, onDisk(name));
        if (!isFile(path)) return next();
        res.setHeader('content-type', 'application/octet-stream');
        createReadStream(path).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: HERE,
  base: './',
  publicDir: join(HERE, 'public'),
  plugins: [arena2Server()],
  resolve: { alias: { '@game': join(REPO, 'src') } },
  server: { port: 5180, fs: { allow: [REPO] } },
  build: { outDir: join(REPO, 'dist-poi-editor'), emptyOutDir: true, target: 'es2022', rollupOptions: { input: join(HERE, 'editor.html') } },
});
