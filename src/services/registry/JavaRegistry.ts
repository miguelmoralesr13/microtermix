import { invoke } from '@tauri-apps/api/core';
import { PackageMetadata, RegistryStrategy } from './types';

export class JavaRegistry implements RegistryStrategy {
  id: 'java' = 'java';

  async fetchPackageInfo(name: string, version?: string): Promise<PackageMetadata> {
    // Para Java, "name" suele ser "groupId:artifactId"
    const parts = name.split(':');
    const groupId = parts[0];
    const artifactId = parts[1];
    
    console.log(`%c[Java Registry] Fetching details for: ${groupId}:${artifactId}`, 'color: #f59e0b; font-weight: bold;');

    try {
        // Usamos maven_search con una query específica para obtener el registro exacto
        const query = `g:${groupId} AND a:${artifactId}`;
        const results = await invoke<any[]>('maven_search', { query });
        const doc = results && results.length > 0 ? results[0] : null;
        
        if (!doc) throw new Error(`Package ${name} not found`);

        const latestVersion = doc.version;
        const currentVersion = version || latestVersion;

        return {
            name: `${doc.group}:${doc.artifact}`,
            version: currentVersion,
            description: `Maven Artifact: ${doc.artifact} by ${doc.group}`,
            readme: `### ${doc.artifact}\n\nTo use this dependency:\n\n**Maven:**\n\`\`\`xml\n<dependency>\n  <groupId>${doc.group}</groupId>\n  <artifactId>${doc.artifact}</artifactId>\n  <version>${currentVersion}</version>\n</dependency>\n\`\`\`\n\n**Gradle:**\n\`\`\`gradle\nimplementation '${doc.group}:${doc.artifact}:${currentVersion}'\n\`\`\``,
            homepage: `https://search.maven.org/artifact/${doc.group}/${doc.artifact}`,
            latestVersion: latestVersion,
            repositoryUrl: `https://github.com/${doc.group.replace(/\./g, '/')}`,
            license: 'Check Maven Central',
            author: doc.group,
            versions: [latestVersion] // Simplificado para Java
        };
    } catch (e) {
        console.error('[Java Registry] Fetch info failed:', e);
        throw e;
    }
  }

  async searchPackages(query: string): Promise<Partial<PackageMetadata>[]> {
    if (!query || query.length < 2) return [];
    
    console.log(`%c[Java Registry] Searching Maven Central via Rust for: ${query}`, 'color: #f59e0b; font-weight: bold;');

    try {
        const results = await invoke<any[]>('maven_search', { query });
        
        if (results && Array.isArray(results)) {
            return results.map(doc => ({
                name: `${doc.group}:${doc.artifact}`,
                version: doc.version,
                description: `${doc.group} » ${doc.artifact}`,
                author: doc.group
            }));
        }
        return [];
    } catch (e) {
        console.error('[Java Registry] Rust search failed:', e);
        return [];
    }
  }

  async getLocalDependencies(projectPath: string): Promise<{name: string, version: string, isDev?: boolean}[]> {
    const deps: {name: string, version: string, isDev?: boolean}[] = [];
    
    try {
        // 1. MAVEN (pom.xml)
        try {
            const pomContent = await invoke<string>('read_file', { path: `${projectPath}/pom.xml` });
            // Regex más flexible para Maven
            const depRegex = /<dependency>[\s\S]*?<groupId>\s*(.*?)\s*<\/groupId>[\s\S]*?<artifactId>\s*(.*?)\s*<\/artifactId>[\s\S]*?(?:<version>\s*(.*?)\s*<\/version>)?[\s\S]*?<\/dependency>/g;
            let match;
            while ((match = depRegex.exec(pomContent)) !== null) {
                deps.push({
                    name: `${match[1].trim()}:${match[2].trim()}`,
                    version: (match[3] || 'managed').trim(),
                    isDev: match[0].includes('<scope>test</scope>')
                });
            }
        } catch (e) {}

        // 2. GRADLE (build.gradle / build.gradle.kts)
        try {
            const possibleGradleFiles = ['build.gradle', 'build.gradle.kts'];
            for (const file of possibleGradleFiles) {
                try {
                    const gradleContent = await invoke<string>('read_file', { path: `${projectPath}/${file}` });
                    // Regex flexible para Gradle (soporta implementation 'group:artifact:version', implementation("group:artifact:version"), etc.)
                    const gradleRegex = /(?:implementation|testImplementation|api|runtimeOnly|compileOnly|compile)\s*\(?\s*['"](.+?):(.+?)(?::(.+?))?['"]\s*\)?/g;
                    let match;
                    while ((match = gradleRegex.exec(gradleContent)) !== null) {
                        deps.push({
                            name: `${match[1].trim()}:${match[2].trim()}`,
                            version: (match[3] || 'latest').trim(),
                            isDev: match[0].includes('test')
                        });
                    }
                    
                    // También soportar formato implementation group: '...', name: '...', version: '...'
                    const gradleVerboseRegex = /(?:implementation|testImplementation|api|runtimeOnly|compileOnly)\s*group:\s*['"](.+?)['"]\s*,\s*name:\s*['"](.+?)['"]\s*(?:,\s*version:\s*['"](.+?)['"])?/g;
                    while ((match = gradleVerboseRegex.exec(gradleContent)) !== null) {
                        deps.push({
                            name: `${match[1].trim()}:${match[2].trim()}`,
                            version: (match[3] || 'latest').trim(),
                            isDev: match[0].includes('test')
                        });
                    }
                } catch (e) {}
            }
        } catch (e) {}

        // Eliminar duplicados por nombre
        const unique = Array.from(new Map(deps.map(d => [d.name.toLowerCase(), d])).values());
        return unique.sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
        return [];
    }
  }
}
