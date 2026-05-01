/**
 * Domain entity representing a system process listening on a port.
 * Pure domain model — no framework dependencies.
 */
export interface ListeningProcess {
  proto: string;
  localAddress: string;
  foreignAddress: string;
  state: string;
  pid: number;
  name: string;
  path: string;
  serviceId: string | null;
}

/**
 * Checks if a process is managed by Microtermix.
 */
export function isManagedByMicrotermix(process: ListeningProcess): boolean {
  return process.serviceId !== null && process.serviceId !== undefined;
}

/**
 * Extracts the port number from the local address.
 */
export function extractPort(process: ListeningProcess): number | null {
  const parts = process.localAddress.split(':');
  const portStr = parts[parts.length - 1];
  const port = parseInt(portStr, 10);
  return isNaN(port) ? null : port;
}
