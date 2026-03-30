import fs from 'fs';
import path from 'path';

// Read package.json
const pkgPath = path.resolve('package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

// Read src-tauri/tauri.conf.json
const tauriConfigPath = path.resolve('src-tauri/tauri.conf.json');
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));

// Sync version
tauriConfig.version = pkg.version;

// Write back to src-tauri/tauri.conf.json
fs.writeFileSync(tauriConfigPath, JSON.stringify(tauriConfig, null, 2));
console.log(`Synced tauri.conf.json to version ${pkg.version}`);
