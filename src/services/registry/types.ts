export interface PackageMetadata {
  name: string;
  version: string;
  description: string;
  readme: string; // Markdown
  homepage?: string;
  latestVersion?: string;
  repositoryUrl?: string;
  license?: string;
  author?: string;
  dependencies?: Record<string, string>;
  versions?: string[]; // Lista de todas las versiones disponibles
}

export interface RegistryStrategy {
  id: 'npm' | 'maven' | 'pypi' | 'go' | 'cargo' | 'java';
  fetchPackageInfo(name: string, version?: string): Promise<PackageMetadata>;
  searchPackages(query: string): Promise<Partial<PackageMetadata>[]>;
  getLocalDependencies(projectPath: string): Promise<{name: string, version: string, isDev?: boolean}[]>;
}

export interface PackageManager {
  id: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'mvn' | 'gradle' | 'pip' | 'poetry' | 'go' | 'cargo';
  install(packageName: string, options?: { isDev?: boolean, version?: string }): Promise<string>;
  uninstall(packageName: string): Promise<string>;
  listInstalled(): Promise<{ name: string, version: string }[]>;
}
