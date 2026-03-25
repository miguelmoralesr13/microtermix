import { NpmRegistry } from './NpmRegistry';
import { PyPiRegistry } from './PyPiRegistry';
import { JavaRegistry } from './JavaRegistry';
import { CargoRegistry } from './CargoRegistry';
import { GoRegistry } from './GoRegistry';
import { RegistryStrategy } from './types';

export class RegistryManager {
  private static instance: RegistryManager;
  private strategies: RegistryStrategy[] = [
    new NpmRegistry(),
    new PyPiRegistry(),
    new JavaRegistry(),
    new CargoRegistry(),
    new GoRegistry(),
  ];

  private constructor() {}

  public static getInstance(): RegistryManager {
    if (!RegistryManager.instance) {
      RegistryManager.instance = new RegistryManager();
    }
    return RegistryManager.instance;
  }

  public getStrategyByProjectType(type: string): RegistryStrategy | null {
    if (['node', 'bun'].includes(type)) {
      return this.strategies.find(s => s.id === 'npm') || null;
    }
    if (type === 'python') {
      return this.strategies.find(s => s.id === 'pypi') || null;
    }
    if (type === 'java') {
      return this.strategies.find(s => s.id === 'java') || null;
    }
    if (type === 'rust') {
      return this.strategies.find(s => s.id === 'cargo') || null;
    }
    if (type === 'go') {
      return this.strategies.find(s => s.id === 'go') || null;
    }
    return null;
  }

  public getStrategyById(id: string): RegistryStrategy | null {
    return this.strategies.find(s => s.id === id) || null;
  }
}
