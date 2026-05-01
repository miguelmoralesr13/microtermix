import { describe, it, expect } from 'vitest';
import { createProcessState, appendLogsToProcess } from './ProcessState';

describe('ProcessState domain', () => {
  describe('createProcessState', () => {
    it('creates a process state with default values', () => {
      const state = createProcessState('test::script ', 'running');

      expect(state.id).toBe('test::script ');
      expect(state.status).toBe('running');
      expect(state.source).toBe('services');
      expect(state.logs).toEqual([]);
      expect(state.restarts).toBe(0);
      expect(state.script).toBeUndefined();
      expect(state.envJson).toBeUndefined();
    });

    it('creates a process state with custom source', () => {
      const state = createProcessState('test::script ', 'running', 'git');
      expect(state.source).toBe('git');
    });

    it('creates a process state with script and envJson', () => {
      const state = createProcessState('test::script ', 'running', 'services', 'npm run dev', '{"PORT":"3000"}');
      expect(state.script).toBe('npm run dev');
      expect(state.envJson).toBe('{"PORT":"3000"}');
    });
  });

  describe('appendLogsToProcess', () => {
    it('appends logs to a process state', () => {
      const state = createProcessState('test::script ', 'running');
      const updated = appendLogsToProcess(state, ['line1', 'line2']);

      expect(updated.logs).toEqual(['line1', 'line2']);
      // Original state is unchanged (immutable)
      expect(state.logs).toEqual([]);
    });

    it('caps logs at maxLines', () => {
      const state = createProcessState('test::script ', 'running');
      const logs = Array.from({ length: 10 }, (_, i) => `line${i}`);
      const updated = appendLogsToProcess(state, logs, 5);

      expect(updated.logs.length).toBe(5);
      expect(updated.logs).toEqual(['line5', 'line6', 'line7', 'line8', 'line9']);
    });

    it('preserves existing logs when appending', () => {
      const state = createProcessState('test::script ', 'running');
      const withLogs = appendLogsToProcess(state, ['line1', 'line2']);
      const updated = appendLogsToProcess(withLogs, ['line3']);

      expect(updated.logs).toEqual(['line1', 'line2', 'line3']);
    });
  });
});
