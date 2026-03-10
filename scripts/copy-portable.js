/**
 * Copia el ejecutable generado por `tauri build --no-bundle` a la carpeta
 * portable/ para tener un único .exe listo para llevar.
 * Ejecutar en Windows después de npm run tauri:portable.
 */
import { copyFileSync, mkdirSync, existsSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const isWin = process.platform === 'win32';
const exeName = isWin ? 'microtermix.exe' : 'microtermix';
const src = join(root, 'src-tauri', 'target', 'release', exeName);
const outDir = join(root, 'portable');
const dest = join(outDir, exeName);

if (!existsSync(src)) {
  console.error('No se encontró el ejecutable. Ejecuta antes: npm run tauri:portable');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
try {
  copyFileSync(src, dest);
  if (!isWin) chmodSync(dest, 0o755);
  console.log('Portable copiado a:', dest);
} catch (err) {
  console.error('Error al copiar el archivo:', err.message);
  if (err.code === 'EBUSY') {
    console.error('El archivo destino está en uso. Asegúrate de cerrar la aplicación antes de compilar.');
  }
}
