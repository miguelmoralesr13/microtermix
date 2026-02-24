# Microtermix

Aplicación de escritorio construida con **Tauri + React + TypeScript** usando Vite como bundler.

## Requisitos previos

- [Node.js](https://nodejs.org/) (v18 o superior)
- [Rust](https://www.rust-lang.org/tools/install) (incluye `cargo`)
- [Tauri CLI](https://tauri.app/start/prerequisites/) — se instala automáticamente como dev dependency
- **Windows**: WebView2 (incluido en Windows 10/11)
- **Linux**: `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)

## Instalación

```bash
npm install
```

## Modo desarrollo

Para levantar la app en modo desarrollo con hot-reload:

```bash
npm run tauri dev
```

Esto inicia el servidor de Vite y abre la ventana de Tauri. Los cambios en el frontend (React) se reflejan en caliente; los cambios en el backend (Rust/`src-tauri`) recompilan automáticamente.

> Si solo necesitas el frontend sin la ventana nativa de Tauri:
>
> ```bash
> npm run dev
> ```
>
> Esto levanta únicamente el servidor de Vite en `http://localhost:1420` (o el puerto que configure Vite).

## Build para producción

Consulta [BUILD-PORTABLE.md](./BUILD-PORTABLE.md) para generar ejecutables portables en Windows, Linux y macOS.

## IDE recomendado

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
