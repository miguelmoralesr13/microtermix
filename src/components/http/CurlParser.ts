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

    // Robust tokenization: handles single/double quotes and escaped spaces
    const tokens: string[] = [];
    const re = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    let match;
    const cleanCmd = cmd.replace(/\\\n/g, ' '); // Handle multiline
    
    while ((match = re.exec(cleanCmd)) !== null) {
        tokens.push(match[1] !== undefined ? match[1] : (match[2] !== undefined ? match[2] : match[0]));
    }

    let explicitMethod = false;

    for (let i = 1; i < tokens.length; i++) {
        const token = tokens[i];

        // --- FLAGS WITH VALUES ---
        if (token === '-X' || token === '--request') {
            const val = tokens[++i];
            if (val) {
                result.method = val.toUpperCase() as HttpMethod;
                explicitMethod = true;
            }
            continue;
        }

        if (token === '-H' || token === '--header') {
            const val = tokens[++i];
            if (val) {
                const splitIdx = val.indexOf(':');
                if (splitIdx > 0) {
                    result.headers!.push({
                        id: uuidv4(),
                        key: val.substring(0, splitIdx).trim(),
                        value: val.substring(splitIdx + 1).trim(),
                        isActive: true
                    });
                }
            }
            continue;
        }

        if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary' || token === '--data-ascii') {
            const val = tokens[++i];
            if (val) {
                if (!explicitMethod && result.method === 'GET') result.method = 'POST';
                result.body = {
                    type: 'raw',
                    raw: val,
                    rawLanguage: val.trim().startsWith('{') ? 'json' : 'text'
                };
            }
            continue;
        }

        if (token === '-u' || token === '--user') {
            const val = tokens[++i];
            if (val) {
                const auth = btoa(val);
                result.headers!.push({
                    id: uuidv4(),
                    key: 'Authorization',
                    value: `Basic ${auth}`,
                    isActive: true
                });
            }
            continue;
        }

        if (token === '-A' || token === '--user-agent') {
            const val = tokens[++i];
            if (val) {
                result.headers!.push({
                    id: uuidv4(),
                    key: 'User-Agent',
                    value: val,
                    isActive: true
                });
            }
            continue;
        }

        if (token === '-e' || token === '--referer') {
            const val = tokens[++i];
            if (val) {
                result.headers!.push({
                    id: uuidv4(),
                    key: 'Referer',
                    value: val,
                    isActive: true
                });
            }
            continue;
        }

        // --- BOOLEAN FLAGS ---
        if (token === '-I' || token === '--head') {
            result.method = 'HEAD';
            explicitMethod = true;
            continue;
        }

        // --- URL OR IGNORED ---
        if (!token.startsWith('-')) {
            if (!result.url) {
                // If it's a URL, extract potential query params
                try {
                    const urlStr = token.trim();
                    const hasProto = urlStr.includes('://');
                    const tempUrl = new URL(hasProto ? urlStr : `http://${urlStr}`);
                    
                    result.url = hasProto ? `${tempUrl.origin}${tempUrl.pathname}` : urlStr.split('?')[0];

                    tempUrl.searchParams.forEach((value, key) => {
                        result.queryParams!.push({
                            id: uuidv4(),
                            key,
                            value,
                            isActive: true
                        });
                    });
                } catch (e) {
                    // Fallback if URL parsing fails
                    result.url = token;
                }
            }
        }
    }

    return result;
}

