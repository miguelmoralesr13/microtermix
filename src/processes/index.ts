/**
 * Processes Clean Architecture module.
 *
 * Layers:
 * - domain/      : Pure entities, value objects, domain rules
 * - application/ : Ports (interfaces) and use cases
 * - infrastructure/ : Tauri adapters implementing ports
 * - ui/          : React components and hooks
 */

// Domain
export type { ListeningProcess } from './domain';
export { isManagedByMicrotermix, extractPort } from './domain';

// Application ports
export type { ProcessScannerPort } from './application/ports/ProcessScannerPort';
export type { ProcessTerminatorPort } from './application/ports/ProcessTerminatorPort';

// Infrastructure
export { TauriProcessScanner, TauriProcessTerminator } from './infrastructure';

// UI - Components
export { ProcessesPanel } from './ui/ProcessesPanel';

// UI - Hooks
export * from './ui/hooks';
