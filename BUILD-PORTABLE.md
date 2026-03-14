# Build portable (un solo .exe)

Para generar un ejecutable portable que puedas copiar y ejecutar en cualquier Windows (sin instalador):

```bash
npm run tauri:portable
```

- Compila el frontend y la app Tauri **sin** crear instalador (.msi/.exe de NSIS).
- El .exe resultante tiene la UI embebida; solo requiere que el PC tenga **WebView2** (viene en Windows 10/11).
- Tras el build, se copia el ejecutable a la carpeta **`portable/`** en la raíz del proyecto:
  - `portable/devflow-microtermix.exe`

Puedes llevar solo ese archivo (o la carpeta `portable/`) a otro equipo y ejecutarlo ahí.

**Nota:** Si no quieres la copia automática en Windows, ejecuta solo:
```bash
npm run build && npx tauri build --no-bundle
```
El .exe estará en `src-tauri/target/release/microtermix.exe`.

---

## 🐧 Build portable para Linux (Ubuntu, Debian, etc)

Para generar el empaquetado **AppImage** (que funciona como un ejecutable portable para casi cualquier entorno Linux de escritorio):

```bash
npm run tauri:linux
```

- Este comando requiere ejecutarse de forma nativa en un entorno Linux (o en GitHub Actions). No puedes compilar de Windows a Linux desde tu misma máquina a menos que uses WSL/Docker.
- Requisito en Linux: `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
- El .AppImage final se generará en `src-tauri/target/release/bundle/appimage/microtermix_0.1.0_amd64.AppImage`.

---

## 🍎 Build portable para Mac (macOS)

Para generar la app tradicional de macOS (`.app`) y la imagen de disco montable (`.dmg`):

```bash
npm run tauri:mac
```

- Al igual que en Linux, **debes correr este comando en una computadora Mac**.
- El .app final estará dentro de `src-tauri/target/release/bundle/macos/Microtermix.app` y el disco estará en `src-tauri/target/release/bundle/dmg/Microtermix_0.1.0_x64.dmg`.
