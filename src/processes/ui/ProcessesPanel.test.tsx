import { describe, it, expect } from 'vitest';
import type { ListeningProcess } from '../domain';

// Replicate the filter logic from ProcessesPanel for testing
interface TechFilterStrategy {
  id: string;
  label: string;
  matches(process: ListeningProcess): boolean;
}

const techFilters: TechFilterStrategy[] = [
  {
    id: 'all',
    label: 'Todos',
    matches: () => true,
  },
  {
    id: 'node',
    label: 'Node.js',
    matches: (p) => {
      const haystack = `${p.name} ${p.path} ${p.serviceId || ''}`.toLowerCase();
      return /node|npm|npx|bun|yarn|pnpm|deno/.test(haystack);
    },
  },
  {
    id: 'java',
    label: 'Java',
    matches: (p) => {
      const haystack = `${p.name} ${p.path} ${p.serviceId || ''}`.toLowerCase();
      return /java|mvn|gradle|tomcat|jetty|jboss/.test(haystack);
    },
  },
  {
    id: 'web',
    label: 'Web',
    matches: (p) => {
      const port = p.localAddress.split(':').pop() || '';
      return ['80', '443', '3000', '8080', '5173', '4200', '3001', '8000', '4000'].includes(port);
    },
  },
];

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

describe('Tech Filter Strategy', () => {
  describe('all filter', () => {
    it('matches all processes', () => {
      const filter = techFilters.find(f => f.id === 'all')!;
      expect(filter.matches(makeProcess())).toBe(true);
      expect(filter.matches(makeProcess({ name: 'java' }))).toBe(true);
      expect(filter.matches(makeProcess({ name: 'nginx' }))).toBe(true);
    });
  });

  describe('node filter', () => {
    it('matches node processes by name', () => {
      const filter = techFilters.find(f => f.id === 'node')!;
      expect(filter.matches(makeProcess({ name: 'node' }))).toBe(true);
      expect(filter.matches(makeProcess({ name: 'npm' }))).toBe(true);
      expect(filter.matches(makeProcess({ name: 'npx' }))).toBe(true);
      expect(filter.matches(makeProcess({ name: 'bun' }))).toBe(true);
      expect(filter.matches(makeProcess({ name: 'yarn' }))).toBe(true);
    });

    it('matches node processes by path', () => {
      const filter = techFilters.find(f => f.id === 'node')!;
      expect(filter.matches(makeProcess({ path: '/usr/local/bin/node' }))).toBe(true);
      expect(filter.matches(makeProcess({ path: '/home/user/.nvm/versions/node' }))).toBe(true);
    });

    it('matches node processes by serviceId', () => {
      const filter = techFilters.find(f => f.id === 'node')!;
      expect(filter.matches(makeProcess({ serviceId: '/path::npm run dev ' }))).toBe(true);
    });

    it('does not match non-node processes', () => {
      const filter = techFilters.find(f => f.id === 'node')!;
      expect(filter.matches(makeProcess({ name: 'java', path: '/usr/bin/java' }))).toBe(false);
      expect(filter.matches(makeProcess({ name: 'nginx', path: '/usr/sbin/nginx' }))).toBe(false);
      expect(filter.matches(makeProcess({ name: 'python', path: '/usr/bin/python' }))).toBe(false);
    });
  });

  describe('java filter', () => {
    it('matches java processes by name', () => {
      const filter = techFilters.find(f => f.id === 'java')!;
      expect(filter.matches(makeProcess({ name: 'java' }))).toBe(true);
      expect(filter.matches(makeProcess({ name: 'mvn' }))).toBe(true);
      expect(filter.matches(makeProcess({ name: 'gradle' }))).toBe(true);
      expect(filter.matches(makeProcess({ name: 'tomcat' }))).toBe(true);
    });

    it('matches java processes by path', () => {
      const filter = techFilters.find(f => f.id === 'java')!;
      expect(filter.matches(makeProcess({ path: '/usr/lib/jvm/java/bin/java' }))).toBe(true);
      expect(filter.matches(makeProcess({ path: '/opt/maven/bin/mvn' }))).toBe(true);
    });

    it('does not match non-java processes', () => {
      const filter = techFilters.find(f => f.id === 'java')!;
      expect(filter.matches(makeProcess({ name: 'node', path: '/usr/bin/node' }))).toBe(false);
      expect(filter.matches(makeProcess({ name: 'nginx', path: '/usr/sbin/nginx' }))).toBe(false);
    });
  });

  describe('web filter', () => {
    it('matches common web ports', () => {
      const filter = techFilters.find(f => f.id === 'web')!;
      expect(filter.matches(makeProcess({ localAddress: '0.0.0.0:80' }))).toBe(true);
      expect(filter.matches(makeProcess({ localAddress: '0.0.0.0:443' }))).toBe(true);
      expect(filter.matches(makeProcess({ localAddress: '0.0.0.0:3000' }))).toBe(true);
      expect(filter.matches(makeProcess({ localAddress: '0.0.0.0:8080' }))).toBe(true);
      expect(filter.matches(makeProcess({ localAddress: '0.0.0.0:5173' }))).toBe(true);
      expect(filter.matches(makeProcess({ localAddress: '0.0.0.0:4200' }))).toBe(true);
    });

    it('does not match non-web ports', () => {
      const filter = techFilters.find(f => f.id === 'web')!;
      expect(filter.matches(makeProcess({ localAddress: '0.0.0.0:5432' }))).toBe(false); // PostgreSQL
      expect(filter.matches(makeProcess({ localAddress: '0.0.0.0:6379' }))).toBe(false); // Redis
      expect(filter.matches(makeProcess({ localAddress: '0.0.0.0:27017' }))).toBe(false); // MongoDB
    });
  });
});
