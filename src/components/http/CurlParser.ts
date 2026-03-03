import { HttpRequest, HttpMethod } from './HttpClientState';
import { v4 as uuidv4 } from 'uuid';

export function parseCurl(curlCmd: string): Partial<HttpRequest> {
    try {
        if (!curlCmd.trim().startsWith('curl')) {
            throw new Error('Not a valid cURL command');
        }
        return parseCurlManual(curlCmd);
    } catch (e: any) {
        console.warn('CurlParser manual parser failed:', e);
        throw e;
    }
}

// Basic manual parser for simple cURL commands
function parseCurlManual(cmd: string): Partial<HttpRequest> {
    const result: Partial<HttpRequest> = {
        id: uuidv4(),
        name: 'cURL Import',
        method: 'GET',
        headers: [],
        queryParams: [],
        body: { type: 'none' }
    };

    const lines = cmd.replace(/\\\n/g, ' ').split(/\s+/);
    let currentFlag = '';

    for (let i = 1; i < lines.length; i++) {
        let token = lines[i];

        // Strip out single/double quotes around tokens
        if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))) {
            token = token.substring(1, token.length - 1);
        }

        if (token === '-X' || token === '--request') {
            currentFlag = 'method';
        } else if (token === '-H' || token === '--header') {
            currentFlag = 'header';
        } else if (token === '-d' || token === '--data' || token === '--data-raw') {
            currentFlag = 'data';
        } else if (token.startsWith('-')) {
            // ignore other flags for now
            currentFlag = '';
        } else {
            // It's a value
            if (currentFlag === 'method') {
                result.method = token.toUpperCase() as HttpMethod;
                currentFlag = '';
            } else if (currentFlag === 'header') {
                const splitIdx = token.indexOf(':');
                if (splitIdx > 0) {
                    result.headers!.push({
                        id: uuidv4(),
                        key: token.substring(0, splitIdx).trim(),
                        value: token.substring(splitIdx + 1).trim(),
                        isActive: true
                    });
                }
                currentFlag = '';
            } else if (currentFlag === 'data') {
                if (result.method === 'GET') result.method = 'POST'; // curl defaults to POST if -d is present
                result.body = {
                    type: 'raw',
                    raw: token,
                    rawLanguage: 'json' // Assume JSON for generic curl data imports, can refine later
                };
                currentFlag = '';
            } else if (!result.url && token.startsWith('http')) {
                result.url = token;
            }
        }
    }

    return result;
}

