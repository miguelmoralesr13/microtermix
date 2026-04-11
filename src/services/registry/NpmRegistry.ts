import { invoke } from '@tauri-apps/api/core';
import { PackageMetadata, RegistryStrategy } from './types';

export class NpmRegistry implements RegistryStrategy {
  id: 'npm' = 'npm';

  async fetchPackageInfo(name: string, version?: string): Promise<PackageMetadata> {
    const pkgName = name.replace('/', '%2f');
    const url = `https://registry.npmjs.org/${pkgName}`;
    
    // Log the request as a curl command for the user
    console.log(`%c[NPM Registry] Requesting metadata:`, 'color: #3b82f6; font-weight: bold;');
    console.log(`curl -X GET "${url}" -H "Accept: application/json"`);

    const response = await fetch(url);
    if (!response.ok) {
        console.error(`[NPM Registry] Error ${response.status}: ${response.statusText}`);
        throw new Error(`Failed to fetch package ${name}`);
    }
    
    const data = await response.json();
    console.log(`[NPM Registry] Response data for ${name}:`, data);

    const ver = version || data['dist-tags']?.latest;
    const versionData = data.versions[ver];

    if (version) {
        console.log(`[NPM Registry] Specific version requested: ${version}`);
        console.log(`[NPM Registry] Version data:`, versionData);
    }

    // Helper function to extract text and handle objects safely
    const toSafeString = (val: any): string => {
        if (val === null || val === undefined) return '';
        if (typeof val === 'string') return val;
        
        // If it's a Buffer (Tauri/Node specific binary structure)
        if (val.type === 'Buffer' && Array.isArray(val.data)) {
            try { return new TextDecoder().decode(Uint8Array.from(val.data)); } catch (e) {}
        }

        if (typeof val === 'object') {
            // Priority common keys
            const key = val.name || val.text || val.content || val.label || val.url || val.type;
            if (typeof key === 'string') return key;
            
            // Last resort: JSON
            try { return JSON.stringify(val); } catch (e) { return String(val); }
        }
        
        return String(val);
    };

    // Official NPM Documentation Rules:
    // 1. The main README is at the root of the "Packument" (full data object).
    // 2. Individual versions might have their own README if published differently.
    // 3. If version is not provided, we default to the root readme.
    
    let readmeText = '';
    
    if (version && versionData?.readme) {
        // If specific version has a readme, use it
        readmeText = toSafeString(versionData.readme);
    } else {
        // Otherwise use the top-level readme (which is usually the latest)
        readmeText = toSafeString(data.readme);
    }

    // Fallback: if readme is still empty, check the version object for ANY large string
    if (!readmeText || readmeText.trim().length < 5) {
        const fallback = data.readme || versionData?.readme || data.description || '';
        readmeText = toSafeString(fallback);
    }

    const versions = Object.keys(data.versions || {}).reverse();

    const result: PackageMetadata = {
      name: data.name,
      version: ver,
      description: toSafeString(versionData?.description || data.description),
      readme: readmeText || 'No documentation found in npm registry.',
      homepage: data.homepage || versionData?.homepage,
      latestVersion: data['dist-tags']?.latest,
      repositoryUrl: data.repository?.url || versionData?.repository?.url,
      license: toSafeString(versionData?.license || data.license),
      author: toSafeString(versionData?.author || data.author),
      dependencies: versionData?.dependencies || {},
      versions: versions
    };

    console.log(`[NPM Registry] Final processed metadata for UI:`, result);
    return result;
  }

  async searchPackages(query: string): Promise<Partial<PackageMetadata>[]> {
    const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=20`;
    console.log(`[NPM Registry] Searching: curl "${url}"`);
    
    const response = await fetch(url);
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.objects.map((obj: any) => ({
      name: obj.package.name,
      version: obj.package.version,
      description: obj.package.description,
      author: typeof obj.package.author === 'object' ? obj.package.author.name : obj.package.author,
      latestVersion: obj.package.version
    }));
  }

  async getLocalDependencies(projectPath: string): Promise<{name: string, version: string, isDev?: boolean}[]> {
    try {
        const pkgPath = `${projectPath}/package.json`;
        const content = await invoke<string>('read_text_file', { path: pkgPath });
        const json = JSON.parse(content);
        const deps: {name: string, version: string, isDev?: boolean}[] = [];

        if (json.dependencies) {
            Object.entries(json.dependencies).forEach(([name, version]) => {
                deps.push({ name, version: String(version), isDev: false });
            });
        }
        if (json.devDependencies) {
            Object.entries(json.devDependencies).forEach(([name, version]) => {
                deps.push({ name, version: String(version), isDev: true });
            });
        }

        return deps.sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
        return [];
    }
  }
}
