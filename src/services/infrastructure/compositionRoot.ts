/**
 * Composition Root for Services utility.
 * Wires port interfaces to their Tauri implementations.
 *
 * Components should import from this file, not directly from infrastructure.
 * This makes it easy to swap implementations for testing.
 */
import { TauriProjectScanner } from '../infrastructure/tauriProjectScanner';
import { TauriScriptExecutor } from '../infrastructure/tauriScriptExecutor';
import { TauriProcessKiller } from '../infrastructure/tauriProcessKiller';
import { TauriLogReader } from '../infrastructure/tauriLogReader';

export const projectScanner = new TauriProjectScanner();
export const scriptExecutor = new TauriScriptExecutor();
export const processKiller = new TauriProcessKiller();
export const logReader = new TauriLogReader();
