import { invoke } from '@tauri-apps/api/core';
import { PackageMetadata, RegistryStrategy } from './types';

export class GoRegistry implements RegistryStrategy {
  id: 'go' = 'go';

  async fetchPackageInfo(name: string, version?: string): Promise<PackageMetadata> {
    console.log(`%c[Go Registry] Fetching real details for: ${name}`, 'color: #00add8; font-weight: bold;');

    try {
        const details = await invoke<any>('get_go_details', { name });
        
        const currentVersion = version || details.version;

        return {
            name: details.name,
            version: currentVersion,
            description: details.description || `Go Package: ${details.name}`,
            readme: details.readme || `### ${details.name}\n\nNo README found for this package.`,
            homepage: details.homepage || `https://pkg.go.dev/${details.name}`,
            latestVersion: details.version,
            repositoryUrl: details.repository || '',
            license: details.license || 'Check pkg.go.dev',
            author: details.name.split('/')[0],
            versions: [details.version]
        };
    } catch (e) {
        console.error('[Go Registry] Fetch info failed:', e);
        throw e;
    }
  }

  async searchPackages(query: string): Promise<Partial<PackageMetadata>[]> {
    if (!query || query.length < 2) return [];
    
    console.log(`%c[Go Registry] Searching Go Packages for: ${query}`, 'color: #00add8; font-weight: bold;');

    try {
        // Intentamos buscar vía Rust para evitar CORS
        const results = await invoke<any[]>('go_search', { query });
        
        if (results && Array.isArray(results)) {
            return results.map(pkg => ({
                name: pkg.name,
                version: 'latest',
                description: pkg.description || '',
                author: pkg.name.split('/')[0]
            }));
        }
        return [];
    } catch (e) {
        console.error('[Go Registry] Search failed:', e);
        return [];
    }
  }

  async getLocalDependencies(projectPath: string): Promise<{name: string, version: string, isDev?: boolean}[]> {
    const deps: {name: string, version: string, isDev?: boolean}[] = [];
    
    try {
        const content = await invoke<string>('read_file', { path: `${projectPath}/go.mod` });
        
        // Basic parser para go.mod
        let inRequire = false;
        
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            
            if (trimmed.startsWith('require (')) {
                inRequire = true;
                return;
            }
            if (inRequire && trimmed === ')') {
                inRequire = false;
                return;
            }
            
            if (trimmed.startsWith('require ') && !trimmed.includes('(')) {
                const parts = trimmed.split(/\s+/);
                if (parts.length >= 3) {
                    deps.push({
                        name: parts[1],
                        version: parts[2],
                        isDev: trimmed.includes('// indirect')
                    });
                }
            } else if (inRequire && trimmed && !trimmed.startsWith('//')) {
                const parts = trimmed.split(/\s+/);
                if (parts.length >= 2) {
                    deps.push({
                        name: parts[0],
                        version: parts[1],
                        isDev: trimmed.includes('// indirect')
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
