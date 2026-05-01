/**
 * Composition Root for Processes utility.
 * Wires port interfaces to their Tauri implementations.
 */
import { TauriProcessScanner } from '../infrastructure/tauriProcessScanner';
import { TauriProcessTerminator } from '../infrastructure/tauriProcessTerminator';

export const processScanner = new TauriProcessScanner();
export const processTerminator = new TauriProcessTerminator();
