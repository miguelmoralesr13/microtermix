import React from "react";
import "./App.css";
import { WorkspaceProvider, useWorkspace, AppView } from "./context/WorkspaceContext";
import { ServiceManager } from "./components/ServiceManager";
import { UtilityRenderer } from "./components/layout/UtilityRenderer";
import { useGitStore } from "./stores/gitStore";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, ExternalLink, TerminalSquare } from 'lucide-react';
import { Toaster } from 'sonner';
import { registerMonacoThemes } from './lib/monacoThemes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { useAppLogStore } from './stores/appLogStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes default
      refetchOnWindowFocus: true,
    },
  },
});

// Register custom Monaco themes once at app startup
registerMonacoThemes();

// A wrapper to handle initial workspace loading logic
function AppContent() {
  const { state, setWorkspacePath, scanWorkspace, applyWorkspaceConfig, addProjectsFromPaths, openFolderInThisWindow, openFolderInNewWindow } = useWorkspace();
  const configLoadedForPathRef = React.useRef<string | null>(null);
  const initWatchers = useGitStore(s => s.initWatchers);
  const initAppLogListener = useAppLogStore(s => s.initListener);

  // Global App Log Listener (Background)
  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    initAppLogListener().then(fn => unlisten = fn);
    return () => { if (unlisten) unlisten(); };
  }, [initAppLogListener]);

  // Standalone detection
  const params = new URLSearchParams(window.location.search);
  const isStandalone = params.get('standalone') === 'true';
  const standaloneUtility = params.get('utility') as AppView | null;

  // Iniciar watchers globales para Git
  React.useEffect(() => {
    if (state.projects.length > 0) {
      const paths = state.projects.map(p => p.path as string);
      let cleanup: (() => Promise<void>) | undefined;

      initWatchers(paths).then(c => {
        cleanup = c;
      });

      return () => {
        if (cleanup) cleanup();
      };
    }
  }, [state.projects.length, initWatchers]);

  React.useEffect(() => {
    const initWorkspace = async () => {
      let initialPath: string | null = null;
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const label = getCurrentWindow().label;
        initialPath = await invoke<string | null>('get_initial_workspace_for_window', { windowLabel: label });
      } catch (e) {
        console.error('Failed to query backend for initial workspace', e);
      }

      if (initialPath) {
        setWorkspacePath(initialPath);
        scanWorkspace(initialPath);
      } else {
        const params = new URLSearchParams(window.location.search);
        const workspaceParam = params.get('workspace');
        if (workspaceParam) {
          try {
            const path = decodeURIComponent(workspaceParam);
            if (path) {
              setWorkspacePath(path);
              scanWorkspace(path);
            }
          } catch (_) { }
          // window.history.replaceState(null, '', window.location.pathname || '/');
        }
      }
    };
    initWorkspace();
  }, [setWorkspacePath, scanWorkspace]);

  // Purge phantom processes only once at mount, not on every re-render.
  React.useEffect(() => {
    if (!isStandalone) {
        invoke('kill_all_services').catch(console.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (state.currentPath && state.projects.length === 0) {
      configLoadedForPathRef.current = null;
      scanWorkspace(state.currentPath);
    }
  }, [state.currentPath, scanWorkspace, state.projects.length]);

  // Al tener proyectos, cargar config del workspace desde microtermix.json en la carpeta (o crearlo si no existe)
  React.useEffect(() => {
    if (!state.currentPath || state.projects.length === 0) return;
    if (configLoadedForPathRef.current === state.currentPath) return;
    configLoadedForPathRef.current = state.currentPath;
    invoke<string>('read_workspace_config_in_folder', { workspacePath: state.currentPath })
      .then((raw) => {
        const config = JSON.parse(raw || '{}');
        if (config && typeof config === 'object' && Object.keys(config).length > 0) {
          // Combine current scanned projects with all paths mentioned in the config to ensure resolution works for external projects
          const allPotentialPaths = Array.from(new Set([
            ...state.projects.map((p) => p.path as string),
            ...(config.allProjectPaths || [])
          ]));
          
          applyWorkspaceConfig(config, state.currentPath, allPotentialPaths);

          if (config.allProjectPaths && Array.isArray(config.allProjectPaths)) {
            addProjectsFromPaths(config.allProjectPaths, true);
          }
        } else {
          // Generar archivo en automático si no existía (solo version + path)
          invoke('write_workspace_config_in_folder', {
            workspacePath: state.currentPath,
            content: JSON.stringify({ version: 1, workspacePath: state.currentPath }, null, 2),
          }).catch(() => { });
        }
      })
      .catch(() => { });
  }, [state.currentPath, state.projects.length, applyWorkspaceConfig]);

  if (isStandalone && standaloneUtility) {
    return (
        <div className="w-full h-screen bg-slate-900 overflow-hidden relative">
            <UtilityRenderer view={standaloneUtility} />
        </div>
    );
  }

  if (!state.currentPath) {

    return (
      <div className="flex flex-col items-center justify-center h-screen w-full bg-[#020617] text-slate-100 relative overflow-hidden">
        {/* Animated Background Gradients */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-microtermix-neon/20 blur-[120px] rounded-full animate-pulse pointer-events-none" />
        <div className="absolute top-[20%] right-[-10%] w-[30%] h-[50%] bg-microtermix-accent/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10 w-full max-w-lg p-10 rounded-3xl bg-slate-900/40 border border-slate-700/50 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] backdrop-blur-2xl flex flex-col items-center group">

          <div className="w-20 h-20 mb-6 rounded-2xl bg-gradient-to-tr from-microtermix-neon to-microtermix-accent p-[2px] shadow-lg shadow-microtermix-neon/20 group-hover:scale-105 transition-transform duration-500">
            <div className="w-full h-full bg-[#020617] rounded-2xl flex items-center justify-center">
              <TerminalSquare size={36} className="text-microtermix-neon" />
            </div>
          </div>

          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-microtermix-neon via-white to-microtermix-accent mb-3 text-center tracking-tight">
            Microtermix
          </h1>
          <p className="text-slate-400 text-sm mb-10 text-center max-w-sm leading-relaxed">
            El nexo de tu flujo de trabajo de desarrollo. Selecciona un Workspace para comenzar.
          </p>

          <div className="w-full gap-4 flex flex-col">
            <button
              onClick={openFolderInThisWindow}
              className="relative w-full overflow-hidden rounded-xl bg-microtermix-neon/10 border border-microtermix-neon/30 text-microtermix-neon font-semibold py-3.5 px-6 transition-all duration-300 hover:bg-microtermix-neon hover:text-white hover:border-microtermix-neon hover:shadow-[0_0_20px_rgba(56,189,248,0.4)] focus:outline-none flex items-center justify-center gap-3 cursor-pointer"
            >
              <FolderOpen size={18} />
              Abrir Workspace Local
            </button>

            <button
              onClick={openFolderInNewWindow}
              className="relative w-full rounded-xl bg-transparent border border-slate-700 text-slate-300 font-medium py-3 px-6 transition-all duration-300 hover:bg-slate-800 hover:text-white hover:border-slate-500 focus:outline-none flex items-center justify-center gap-2 cursor-pointer"
            >
              <ExternalLink size={16} />
              Abrir Nueva Ventana
            </button>
          </div>

          <div className="mt-8 text-[10px] font-mono text-slate-600 tracking-wider uppercase">
            v0.1.0-alpha
          </div>
        </div>
      </div>
    );
  }

  return <ServiceManager />;
}

/**
 * On Linux WebKitGTK, Ctrl+C/V/X are sometimes not forwarded to the webview.
 * This listener forces execCommand so clipboard always works.
 */
/**
 * On Linux WebKitGTK, standard keyboard shortcuts are not always forwarded to the webview.
 * This maps every Ctrl/Meta+key combo to its execCommand equivalent so they all work.
 */
const EDIT_SHORTCUT_MAP: Record<string, string> = {
  c: 'copy',
  x: 'cut',
  v: 'paste',
  z: 'undo',
  y: 'redo',
  a: 'selectAll',
  b: 'bold',
  i: 'italic',
  u: 'underline',
};

function useLinuxClipboardFix() {
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.defaultPrevented) return;
      const key = e.key.toLowerCase();
      // Ctrl+Shift+Z → redo (alternative to Ctrl+Y)
      const cmd = (e.shiftKey && key === 'z') ? 'redo' : EDIT_SHORTCUT_MAP[key];
      
      if (cmd) {
        // Prevent double trigger if we are in an input/textarea
        const active = document.activeElement;
        const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable);
        
        if (isInput && cmd === 'paste') {
          // Let the browser handle native paste in inputs
          return;
        }
        
        document.execCommand(cmd);
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, []);
}

function App() {
  useLinuxClipboardFix();
  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider>
        <AppContent />
        <Toaster position="bottom-right" theme="dark" richColors />
      </WorkspaceProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
