import ReactDOM from "react-dom/client";
import App from "./App";

// Prevenir zoom con teclado y rueda del ratón
if (typeof window !== 'undefined') {
  const preventZoom = (e: any) => {
    if (e.ctrlKey || e.metaKey) {
      if (['+', '-', '=', '0'].includes(e.key) || e.type === 'wheel') {
        e.preventDefault();
      }
    }
  };
  window.addEventListener('keydown', preventZoom, { capture: true });
  window.addEventListener('wheel', preventZoom, { passive: false, capture: true });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />
);
