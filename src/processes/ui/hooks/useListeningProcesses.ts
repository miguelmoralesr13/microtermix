/**
 * useListeningProcesses - Hook for scanning and managing listening processes.
 *
 * Uses domain types and infrastructure adapters.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TauriProcessScanner, TauriProcessTerminator } from '../../infrastructure';
import type { ListeningProcess } from '../../domain';
import { isManagedByMicrotermix, extractPort } from '../../domain';

export const processKeys = {
  all: ['processes'] as const,
  listening: () => [...processKeys.all, 'listening'] as const,
};

const scanner = new TauriProcessScanner();
const terminator = new TauriProcessTerminator();

/**
 * Hook to get all listening processes on the system.
 */
export function useListeningProcesses() {
  return useQuery({
    queryKey: processKeys.listening(),
    queryFn: async (): Promise<ListeningProcess[]> => {
      return scanner.scan();
    },
    staleTime: 10_000, // 10 seconds
  });
}

/**
 * Hook to terminate a process by PID.
 */
export function useTerminateProcess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pid: number) => {
      await terminator.terminate(pid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: processKeys.all });
    },
  });
}

/**
 * Filter processes by protocol.
 */
export function filterByProtocol(
  processes: ListeningProcess[],
  protocol: 'tcp' | 'udp' | 'all',
): ListeningProcess[] {
  if (protocol === 'all') return processes;
  return processes.filter((p) => p.proto.toLowerCase() === protocol);
}

/**
 * Filter processes that are managed by Microtermix.
 */
export function filterManaged(processes: ListeningProcess[]): ListeningProcess[] {
  return processes.filter(isManagedByMicrotermix);
}

/**
 * Filter processes by port number.
 */
export function filterByPort(
  processes: ListeningProcess[],
  port: number,
): ListeningProcess[] {
  return processes.filter((p) => {
    const processPort = extractPort(p);
    return processPort === port;
  });
}

/**
 * Group processes by state.
 */
export function groupByState(
  processes: ListeningProcess[],
): Record<string, ListeningProcess[]> {
  return processes.reduce(
    (acc, p) => {
      const state = p.state || 'UNKNOWN';
      if (!acc[state]) acc[state] = [];
      acc[state].push(p);
      return acc;
    },
    {} as Record<string, ListeningProcess[]>,
  );
}

// Re-export domain helpers
export { isManagedByMicrotermix, extractPort };
