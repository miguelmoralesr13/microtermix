# GEMINI.md - Microtermix

Core mandates and project-specific instructions for **Microtermix** (devflow-microtermix).

## Project Identity
Microtermix is a desktop developer workspace manager built with **Tauri v2 + React 19 + TypeScript + TailwindCSS v4**. It manages multi-project monorepos, AWS resources, Git operations, and CI/CD integrations.

## Core Mandates
- **Surgical Codebase Management:** Adhere strictly to existing patterns. Use `CLAUDE.md` as the primary reference for architectural decisions and naming conventions.
- **UI Consistency (CRITICAL):** ALWAYS use **shadcn/ui** components.
    - Components are built on **`@base-ui/react`**, NOT Radix UI.
    - Use `cn()` from `@/lib/utils` for tailwind class merging.
    - Refer to `CLAUDE.md` for specific Base UI vs Radix differences (e.g., `TooltipTrigger` uses `render` prop instead of `asChild`).
- **State Management:**
    - **Global Workspace State:** Use `WorkspaceContext` in `src/context/WorkspaceContext.tsx`.
    - **Git/Domain State:** Use specialized Zustand stores in `src/stores/` (e.g., `gitStore.ts`, `tempoStore.ts`).
- **Service ID Format:** Must follow `"${projectPath}::${script} "` (note the trailing space).
- **Backend/Rust Integrity:** Ensure Tauri commands are registered in `src-tauri/src/lib.rs` and state is managed via `AppState` in `src-tauri/src/state.rs`.

## Technical Stack
- **Frontend:** React 19, Vite, TailwindCSS v4 (using `@tailwindcss/vite` plugin).
- **Desktop:** Tauri v2 (Rust backend).
- **Editor:** Monaco Editor for code views.
- **Terminal:** xterm.js for log streaming.
- **AWS Integration:** AWS SDK for Rust (CloudWatch, EC2, SSM, API Gateway).
- **State/Caching:** Zustand (with persist) and TanStack Query.

## Key Architecture Patterns
- **Frontend-Backend Split:** 
    - Heavy lifting (Git native, AWS, Process execution, Proxy) resides in Rust (`src-tauri/`).
    - UI and orchestration reside in React (`src/`).
- **Workspace Config:** Persistent state is saved to `microtermix.json` in the workspace root.
- **Async Events:** Use Tauri's event system (e.g., `service-logs`) for real-time log streaming.

## Development Workflow
- **Dev Mode:** `npm run tauri dev`
- **Frontend Only:** `npm run dev` (Port 1420)
- **Production Build:** `npm run build`
- **Portable Build (Win):** `npm run tauri:portable`

## Component Standards
- **Buttons:** Use `@/components/ui/button`.
- **Modals:** Use `@/components/ui/dialog` (Base UI based).
- **Icons:** Use `lucide-react`.
- **Styling:** Use Tailwind utility classes. The dark theme base is `#020617` (defined in `src/App.css`).
