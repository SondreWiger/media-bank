#!/usr/bin/env node
/*
  Packs the app into ./build for upload to a server.
  It creates a runnable copy with a minimal package.json and a README.
*/
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'build');

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function cp(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}
function cpDir(srcDir, destDir) {
  ensureDir(destDir);
  for (const entry of fs.readdirSync(srcDir)) {
    const s = path.join(srcDir, entry);
    const d = path.join(destDir, entry);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) cpDir(s, d); else cp(s, d);
  }
}

// 1) Reset build dir
if (fs.existsSync(OUT)) {
  // remove existing build content
  fs.rmSync(OUT, { recursive: true, force: true });
}
ensureDir(OUT);

// 2) Copy runtime files
const FILES = [
  'server.js',
  'index.html',
  'bank.html',
  'about.html',
  'safety.html',
  'api-controls.html',
  'styles.css',
  'script.js',
];
for (const f of FILES) {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) cp(src, path.join(OUT, f));
}

// 3) Copy src/ (db, etc)
if (fs.existsSync(path.join(ROOT, 'src'))) {
  cpDir(path.join(ROOT, 'src'), path.join(OUT, 'src'));
}

// 4) Create empty runtime dirs (uploads/, data/)
ensureDir(path.join(OUT, 'uploads', 'originals'));
ensureDir(path.join(OUT, 'uploads', 'thumbs'));
ensureDir(path.join(OUT, 'data'));

// 5) Minimal package.json for production
const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const outPkg = {
  name: pkg.name || 'media-bank',
  version: pkg.version || '1.0.0',
  private: true,
  main: 'server.js',
  scripts: {
    start: 'node server.js',
    'start:one': "sh -c 'test -d node_modules || npm ci --omit=dev; PORT=${PORT:-3000} NODE_ENV=${NODE_ENV:-production} node server.js'"
  },
  dependencies: pkg.dependencies || {},
};
fs.writeFileSync(path.join(OUT, 'package.json'), JSON.stringify(outPkg, null, 2));

// 5.1) Copy lockfile so `npm ci` works in build/
const lockfile = path.join(ROOT, 'package-lock.json');
if (fs.existsSync(lockfile)) {
  cp(lockfile, path.join(OUT, 'package-lock.json'));
}

// 6) README with run instructions
const README = `# Media Bank – Server Bundle

This folder is a production-ready bundle.

## Run

- Install prod deps (uses lockfile for reproducible install)
  npm ci --omit=dev

  # If npm ci errors due to missing/old lockfile, use:
  # npm install --omit=dev

- Start server
  PORT=3000 NODE_ENV=production npm start

Open http://localhost:3000/bank

## Notes
- Data is saved in ./data and ./uploads. Keep them writable and backed up.
- Behind a proxy (nginx/cloudflare), X-Forwarded-For is trusted for IP-restricted folders.
`;
fs.writeFileSync(path.join(OUT, 'README_RUN.md'), README);

console.log('✔ Build created at ./build');
