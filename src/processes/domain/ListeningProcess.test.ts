import { describe, it, expect } from 'vitest';
import { isManagedByMicrotermix, extractPort } from './ListeningProcess';
import type { ListeningProcess } from './ListeningProcess';

function makeProcess(overrides: Partial<ListeningProcess> = {}): ListeningProcess {
  return {
    proto: 'tcp',
    localAddress: '0.0.0.0:3000',
    foreignAddress: '*:*',
    state: 'LISTEN',
    pid: 1234,
    name: 'node',
    path: '/usr/bin/node',
    serviceId: null,
    ...overrides,
  };
}

describe('ListeningProcess domain', () => {
  describe('isManagedByMicrotermix', () => {
    it('returns true when serviceId is set', () => {
      const proc = makeProcess({ serviceId: '/path::npm run dev ' });
      expect(isManagedByMicrotermix(proc)).toBe(true);
    });

    it('returns false when serviceId is null', () => {
      const proc = makeProcess({ serviceId: null });
      expect(isManagedByMicrotermix(proc)).toBe(false);
    });

    it('returns false when serviceId is undefined', () => {
      const proc = makeProcess();
      delete (proc as any).serviceId;
      expect(isManagedByMicrotermix(proc as ListeningProcess)).toBe(false);
    });
  });

  describe('extractPort', () => {
    it('extracts port from IPv4 address', () => {
      const proc = makeProcess({ localAddress: '0.0.0.0:3000' });
      expect(extractPort(proc)).toBe(3000);
    });

    it('extracts port from IPv6 address', () => {
      const proc = makeProcess({ localAddress: '[::]:8080' });
      expect(extractPort(proc)).toBe(8080);
    });

    it('extracts port from localhost address', () => {
      const proc = makeProcess({ localAddress: '127.0.0.1:5173' });
      expect(extractPort(proc)).toBe(5173);
    });

    it('returns null for invalid port', () => {
      const proc = makeProcess({ localAddress: '0.0.0.0:abc' });
      expect(extractPort(proc)).toBeNull();
    });
  });
});
