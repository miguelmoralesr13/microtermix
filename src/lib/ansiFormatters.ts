/**
 * Utilidades para dar formato de colores ANSI a flujos de texto en tiempo real
 * para la Terminal.
 */

// Terminal ANSI codes
const ANSI = {
    reset: '\x1b[0m',
    green: '\x1b[38;5;114m',
    cyan: '\x1b[38;5;80m',
    yellow: '\x1b[38;5;220m',
    orange: '\x1b[38;5;208m',
    blue: '\x1b[38;5;75m',
    gray: '\x1b[38;5;244m',
    red: '\x1b[38;5;196m',
    magenta: '\x1b[38;5;170m',
};

export type TerminalOutputFormat = 'raw' | 'json' | 'yaml';

/**
 * Aplica resaltado de sintaxis ANSI a una línea de texto basada en un formato esperado.
 * Funciona línea por línea, ideal para flujos en vivo.
 */
export function formatAnsiOutput(line: string, format: TerminalOutputFormat = 'raw'): string {
    if (!line || format === 'raw') return line;

    switch (format) {
        case 'json': {
            try {
                // If it's a valid JSON string (e.g. full dump), pretty-print it first
                const parsed = JSON.parse(line);
                const pretty = JSON.stringify(parsed, null, 2);
                return pretty.split('\n').map(highlightJsonLine).join('\n');
            } catch {
                // Return highlighted raw line if not a complete JSON string
                return highlightJsonLine(line);
            }
        }
        case 'yaml':
            return highlightYamlLine(line);
        default:
            return line;
    }
}

function highlightJsonLine(line: string): string {
    // Si la línea contiene el tag PROG: especial interno, no la procesamos como JSON puro
    if (line.includes('⚡') || line.includes('PROG:')) return line;

    // Resaltado rápido usando regexes línea por línea.
    // Order matters since we wrap things in ANSI codes containing numbers and brackets!
    // We should parse carefully to avoid double-replacing. 
    // The safest way is to do a combined regex to parse tokens.
    
    const jsonTokenRegex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?=\s*:))|(\b(?:true|false|null)\b)|(-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)|("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")|([{}\[\]:,]+)/g;

    return line.replace(jsonTokenRegex, (match, pKey, _1, pBool, pNum, pStr) => {
        if (pKey) {
            // Json key
            return `${ANSI.cyan}${match}${ANSI.reset}`;
        }
        if (pBool) {
            // Boolean or null
            return `${ANSI.magenta}${match}${ANSI.reset}`;
        }
        if (pNum) {
            // Number
            return `${ANSI.orange}${match}${ANSI.reset}`;
        }
        if (pStr) {
            // String value
            return `${ANSI.green}${match}${ANSI.reset}`;
        }
        // Punctuation (braces, brackets, etc)
        return `${ANSI.gray}${match}${ANSI.reset}`;
    });
}

function highlightYamlLine(line: string): string {
    // Regex simple para yaml
    // Key: value
    const yamlKeyVal = /^(\s*)([a-zA-Z0-9_-]+)(:)(.*)$/;
    const match = line.match(yamlKeyVal);
    if (match) {
        const [_, indent, key, colon, rest] = match;
        
        let highlightedRest = rest;
        // String
        if (rest.trim().startsWith("'") || rest.trim().startsWith('"')) {
            highlightedRest = `${ANSI.green}${rest}${ANSI.reset}`;
        } else if (/^(true|false|null)$/i.test(rest.trim())) {
            highlightedRest = `${ANSI.magenta}${rest}${ANSI.reset}`;
        } else if (/^-?\d+(\.\d+)?$/.test(rest.trim())) {
            highlightedRest = `${ANSI.orange}${rest}${ANSI.reset}`;
        }

        return `${indent}${ANSI.cyan}${key}${ANSI.gray}${colon}${ANSI.reset}${highlightedRest}`;
    }
    
    // Arrays
    if (line.trim().startsWith('- ')) {
        const idx = line.indexOf('-');
        return `${line.substring(0, idx)}${ANSI.yellow}-${ANSI.reset}${line.substring(idx + 1)}`;
    }

    return line;
}
