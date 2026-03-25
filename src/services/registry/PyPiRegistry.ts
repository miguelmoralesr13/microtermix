import { invoke } from '@tauri-apps/api/core';
import { PackageMetadata, RegistryStrategy } from './types';

export class PyPiRegistry implements RegistryStrategy {
  id: 'pypi' = 'pypi';

  async fetchPackageInfo(name: string, version?: string): Promise<PackageMetadata> {
    const url = version 
        ? `https://pypi.org/pypi/${name}/${version}/json`
        : `https://pypi.org/pypi/${name}/json`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch Python package ${name}`);
    
    const data = await response.json();
    const info = data.info;
    const versions = Object.keys(data.releases || {}).reverse();

    const toSafeString = (val: any): string => {
        if (!val) return '';
        if (typeof val === 'string') return val;
        return JSON.stringify(val, null, 2);
    };

    return {
      name: info.name,
      version: info.version,
      description: toSafeString(info.summary),
      readme: toSafeString(info.description) || 'No documentation found on PyPI.',
      homepage: info.home_page || info.project_url,
      latestVersion: info.version,
      repositoryUrl: info.project_urls?.Source || info.project_urls?.Repository,
      license: toSafeString(info.license),
      author: toSafeString(info.author || info.author_email),
      versions: versions
    };
  }

  async searchPackages(query: string): Promise<Partial<PackageMetadata>[]> {
    if (!query || query.length < 2) return [];
    
    console.log(`%c[PyPI Registry] Autocomplete search for: ${query}`, 'color: #3b82f6; font-weight: bold;');

    try {
        const rustResults = await invoke<any[]>('pypi_search', { query });
        
        if (rustResults && Array.isArray(rustResults)) {
            console.log(`[PyPI Registry] Found ${rustResults.length} matches:`, rustResults.map(r => r.name).join(', '));
            
            return rustResults.map(pkg => ({
                name: pkg.name,
                version: 'latest',
                description: 'Python Package (select for details)',
                author: 'PyPI Community'
            }));
        }
        
        return [];
    } catch (e) {
        console.error('[PyPI Registry] Search error:', e);
        
        // Match exacto como fallback final
        try {
            const exact = await this.fetchPackageInfo(query);
            return [exact];
        } catch (inner) {
            return [];
        }
    }
  }

  async getLocalDependencies(projectPath: string): Promise<{name: string, version: string, isDev?: boolean}[]> {
    const deps: {name: string, version: string, isDev?: boolean}[] = [];
    
    const parseRequirements = (content: string) => {
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('-')) {
                // Match name==version or name>=version or name
                const match = trimmed.match(/^([a-zA-Z0-9\-_]+)([><=~ \t]*[0-9a-zA-Z\.\-_]*)?/);
                if (match && match[1]) {
                    const name = match[1].trim();
                    let version = match[2]?.replace(/[>=<~ ]/g, '').trim() || 'latest';
                    deps.push({ name, version, isDev: false });
                }
            }
        });
    };

    // 1. Intentar obtener dependencias "vivas" del entorno (pip list)
    try {
        console.log(`%c[PyPI Registry] Scanning live environment in: ${projectPath}`, 'color: #10b981; font-weight: bold;');
        const livePackages = await invoke<{name: string, version: string}[]>('get_python_packages', { projectPath });
        if (livePackages && livePackages.length > 0) {
            livePackages.forEach(pkg => {
                deps.push({ name: pkg.name, version: pkg.version, isDev: false });
            });
        }
    } catch (e) {
        console.warn('[PyPI Registry] Live scan failed, falling back to static files:', e);
    }

    // 2. Intentar leer en varios lugares comunes de Python (Static files)
    try {
        const possibleFiles = [
            'requirements.txt',
            'reqs.txt',
            'pyproject.toml',
            'Pipfile'
        ];

        for (const file of possibleFiles) {
            try {
                const path = `${projectPath}/${file}`;
                const content = await invoke<string>('read_file', { path });
                
                if (file.includes('requirements') || file === 'reqs.txt') {
                    parseRequirements(content);
                } else if (file === 'pyproject.toml') {
                    const sectionMatch = content.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(\[|$)/);
                    if (sectionMatch) {
                        sectionMatch[1].split('\n').forEach(line => {
                            const m = line.match(/^([\w-]+)\s*=\s*["'](.+?)["']/);
                            if (m) deps.push({ name: m[1], version: m[2].replace(/[\^~]/g, ''), isDev: false });
                        });
                    }
                }
            } catch (e) {
                // Archivo no existe, probar el siguiente
            }
        }

        // Eliminar duplicados por nombre (priorizar live scan si existe)
        const unique = Array.from(new Map(deps.map(d => [d.name.toLowerCase(), d])).values());
        return unique.sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
        return [];
    }
  }
}
