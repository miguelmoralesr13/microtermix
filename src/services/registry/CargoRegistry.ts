import { invoke } from '@tauri-apps/api/core';
import { PackageMetadata, RegistryStrategy } from './types';

export class CargoRegistry implements RegistryStrategy {
  id: 'cargo' = 'cargo';

  async fetchPackageInfo(name: string, version?: string): Promise<PackageMetadata> {
    console.log(`%c[Cargo Registry] Fetching real details for: ${name}`, 'color: #ea580c; font-weight: bold;');

    try {
        const details = await invoke<any>('get_cargo_details', { name });
        
        const currentVersion = version || details.version;

        return {
            name: details.name,
            version: currentVersion,
            description: details.description || 'No description available',
            readme: details.readme || `### ${details.name}\n\nNo README found on crates.io for this version.`,
            homepage: details.homepage || `https://crates.io/crates/${details.name}`,
            latestVersion: details.version,
            repositoryUrl: details.repository || '',
            license: details.license || 'Check crates.io',
            author: 'Rust Community',
            versions: [details.version]
        };
    } catch (e) {
        console.error('[Cargo Registry] Fetch info failed:', e);
        throw e;
    }
  }

  async searchPackages(query: string): Promise<Partial<PackageMetadata>[]> {
    if (!query || query.length < 2) return [];
    
    console.log(`%c[Cargo Registry] Searching Crates.io via Rust for: ${query}`, 'color: #ea580c; font-weight: bold;');

    try {
        const results = await invoke<any[]>('cargo_search', { query });
        
        if (results && Array.isArray(results)) {
            return results.map(pkg => ({
                name: pkg.name,
                version: pkg.version,
                description: pkg.description || '',
                author: 'crates.io'
            }));
        }
        return [];
    } catch (e) {
        console.error('[Cargo Registry] Rust search failed:', e);
        return [];
    }
  }

  async getLocalDependencies(projectPath: string): Promise<{name: string, version: string, isDev?: boolean}[]> {
    const deps: {name: string, version: string, isDev?: boolean}[] = [];
    
    try {
        const content = await invoke<string>('read_file', { path: `${projectPath}/Cargo.toml` });
        
        // Basic parser for Cargo.toml [dependencies]
        const sections = ['[dependencies]', '[dev-dependencies]', '[build-dependencies]'];
        let currentSection = '';
        
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (sections.includes(trimmed)) {
                currentSection = trimmed;
                return;
            }
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                currentSection = '';
                return;
            }
            
            if (currentSection && trimmed && !trimmed.startsWith('#')) {
                const match = trimmed.match(/^([\w-]+)\s*=\s*(?:["'](.+?)["']|\{.*?version\s*=\s*["'](.+?)["'])/);
                if (match) {
                    deps.push({
                        name: match[1],
                        version: (match[2] || match[3] || 'latest').replace(/[\^~=]/g, ''),
                        isDev: currentSection === '[dev-dependencies]'
                    });
                }
            }
        });

        const unique = Array.from(new Map(deps.map(d => [d.name.toLowerCase(), d])).values());
        return unique.sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
        return [];
    }
  }
}
