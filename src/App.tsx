import React from "react";
import "./App.css";
import { WorkspaceProvider, useWorkspace } from "./context/WorkspaceContext";
import { ServiceManager } from "./components/ServiceManager";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, ExternalLink, TerminalSquare } from 'lucide-react';
import { Toaster } from 'sonner';

// A wrapper to handle initial workspace loading logic
function AppContent() {
  const { state, setWorkspacePath, scanWorkspace, applyWorkspaceConfig, openFolderInThisWindow, openFolderInNewWindow } = useWorkspace();
  const configLoadedForPathRef = React.useRef<string | null>(null);

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
          window.history.replaceState(null, '', window.location.pathname || '/');
        }
      }
    };
    initWorkspace();
  }, []);

  React.useEffect(() => {
    // Purge any phantom processes on soft refreshes.
    invoke('kill_all_services').catch(console.error);

    if (state.currentPath && state.projects.length === 0) {
      configLoadedForPathRef.current = null;
      scanWorkspace(state.currentPath);
    }
  }, [state.currentPath]);

  // Al tener proyectos, cargar config del workspace desde nexus-workspace.json en la carpeta (o crearlo si no existe)
  React.useEffect(() => {
    if (!state.currentPath || state.projects.length === 0) return;
    if (configLoadedForPathRef.current === state.currentPath) return;
    configLoadedForPathRef.current = state.currentPath;
    invoke<string>('read_workspace_config_in_folder', { workspacePath: state.currentPath })
      .then((raw) => {
        const config = JSON.parse(raw || '{}');
        if (config && typeof config === 'object' && Object.keys(config).length > 0) {
          const projectPaths = state.projects.map((p) => p.path as string);
          applyWorkspaceConfig(config, state.currentPath, projectPaths);
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

  if (!state.currentPath) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-full bg-[#020617] text-slate-100 relative overflow-hidden">
        {/* Animated Background Gradients */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-nexus-neon/20 blur-[120px] rounded-full animate-pulse pointer-events-none" />
        <div className="absolute top-[20%] right-[-10%] w-[30%] h-[50%] bg-nexus-accent/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10 w-full max-w-lg p-10 rounded-3xl bg-slate-900/40 border border-slate-700/50 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] backdrop-blur-2xl flex flex-col items-center group">

          <div className="w-20 h-20 mb-6 rounded-2xl bg-gradient-to-tr from-nexus-neon to-nexus-accent p-[2px] shadow-lg shadow-nexus-neon/20 group-hover:scale-105 transition-transform duration-500">
            <div className="w-full h-full bg-[#020617] rounded-2xl flex items-center justify-center">
              <TerminalSquare size={36} className="text-nexus-neon" />
            </div>
          </div>

          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-nexus-neon via-white to-nexus-accent mb-3 text-center tracking-tight">
            Microtermix
          </h1>
          <p className="text-slate-400 text-sm mb-10 text-center max-w-sm leading-relaxed">
            El nexo de tu flujo de trabajo de desarrollo. Selecciona un Workspace para comenzar.
          </p>

          <div className="w-full gap-4 flex flex-col">
            <button
              onClick={openFolderInThisWindow}
              className="relative w-full overflow-hidden rounded-xl bg-nexus-neon/10 border border-nexus-neon/30 text-nexus-neon font-semibold py-3.5 px-6 transition-all duration-300 hover:bg-nexus-neon hover:text-white hover:border-nexus-neon hover:shadow-[0_0_20px_rgba(56,189,248,0.4)] focus:outline-none flex items-center justify-center gap-3 cursor-pointer"
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

function App() {
  return (
    <WorkspaceProvider>
      <AppContent />
      <Toaster position="bottom-right" theme="dark" richColors />
    </WorkspaceProvider>
  );
}

export default App;
