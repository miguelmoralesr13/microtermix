/**
 * Simple utility to parse and stringify Java-style .properties files.
 */

export type SonarProperties = Record<string, string>;

/**
 * Parses a .properties file content into a Record<string, string>.
 * Supports:
 * - key=value
 * - key:value
 * - Comments (# and !)
 * - Trimming keys and values
 * - BOM removal
 */
export function parseProperties(content: string): SonarProperties {
    const properties: SonarProperties = {};
    
    // Remove BOM if present
    const cleanContent = content.replace(/^\uFEFF/, '');
    const lines = cleanContent.split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
            continue;
        }

        // find the first occurrence of = or :
        const delimiterIndex = trimmed.search(/[=:]/);
        
        if (delimiterIndex !== -1) {
            const key = trimmed.substring(0, delimiterIndex).trim();
            const value = trimmed.substring(delimiterIndex + 1).trim();
            
            if (key) {
                properties[key] = value;
            }
        } else {
            // Case where there is a key but no value separator
            const key = trimmed.trim();
            if (key) {
                properties[key] = '';
            }
        }
    }

    return properties;
}

/**
 * Stringifies a record into a .properties file content.
 */
export function stringifyProperties(props: SonarProperties): string {
    return Object.entries(props)
        .filter(([key]) => !!key.trim())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
}
