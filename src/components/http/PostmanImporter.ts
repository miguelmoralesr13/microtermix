import { Collection, Item, ItemGroup } from 'postman-collection';
import { HttpRequest, HttpCollectionFolder, HttpMethod, KeyValuePair, HttpBody } from './HttpClientState';
import { v4 as uuidv4 } from 'uuid';

/**
 * Parses a Postman Collection JSON (v2.1.0) into our internal structure.
 */
export async function parsePostmanCollection(jsonString: string): Promise<HttpCollectionFolder> {
    try {
        const rawJson = JSON.parse(jsonString);
        const collection = new Collection(rawJson);
        const folder: HttpCollectionFolder = {
            id: collection.id || uuidv4(),
            name: collection.name || 'Imported Collection',
            type: 'collection',
            items: []
        };

        collection.items.each((item) => {
            folder.items.push(processPostmanItem(item, folder.id));
        });

        // Try to extract collection variables if any
        const variables: Record<string, string> = {};
        if (collection.variables) {
            collection.variables.each((vr) => {
                if (vr.key && vr.value !== undefined) {
                    variables[vr.key] = vr.value.toString();
                }
            });
        }

        if (Object.keys(variables).length > 0) {
            folder.variables = variables;
        }

        // You could return variables here too if needed, for now we just return the tree
        return folder;
    } catch (e: any) {
        throw new Error(`Failed to parse Postman collection: ${e.message}`);
    }
}

function processPostmanItem(item: Item | ItemGroup<Item>, parentId: string): HttpRequest | HttpCollectionFolder {
    // If it's a folder (ItemGroup)
    // @ts-ignore - isItemGroup exists at runtime usually, or checking items
    if (Item.isItemGroup ? Item.isItemGroup(item) : (item as any).items) {
        const folder: HttpCollectionFolder = {
            id: item.id || uuidv4(),
            name: item.name || 'Folder',
            type: 'folder',
            items: []
        };
        (item as any).items.each((subItem: any) => {
            folder.items.push(processPostmanItem(subItem, folder.id));
        });
        return folder;
    }

    // It's an Item (Request)
    // Postman SDK typescript definitions can be weird, so we force cast it to Item
    const reqItem = item as Item;
    const pmReq = reqItem.request;

    // Default method to GET
    const method = (pmReq.method ? pmReq.method.toUpperCase() : 'GET') as HttpMethod;

    // URL
    const url = pmReq.url ? pmReq.url.toString() : '';

    // Headers
    const headers: KeyValuePair[] = [];
    pmReq.headers.each((h) => {
        headers.push({
            id: uuidv4(),
            key: h.key || '',
            value: h.value || '',
            isActive: !h.disabled,
            description: h.description?.toString()
        });
    });

    // Query Params
    const queryParams: KeyValuePair[] = [];
    if (pmReq.url && pmReq.url.query) {
        pmReq.url.query.each((q) => {
            queryParams.push({
                id: uuidv4(),
                key: q.key || '',
                value: q.value || '',
                isActive: !q.disabled,
                description: q.description?.toString()
            });
        });
    }

    // Body
    let body: HttpBody = { type: 'none' };
    if (pmReq.body && pmReq.body.mode) {
        const mode = pmReq.body.mode;
        if (mode === 'raw') {
            body = {
                type: 'raw',
                raw: pmReq.body.raw || '',
                rawLanguage: getLanguageFromOptions((pmReq.body as any).options)
            };
        } else if (mode === 'formdata' && pmReq.body.formdata) {
            const fd: KeyValuePair[] = [];
            pmReq.body.formdata.each((f) => {
                fd.push({
                    id: uuidv4(),
                    key: f.key,
                    value: f.value ? String(f.value) : '', // Note: we don't fully support file uploads yet
                    isActive: !f.disabled,
                    description: f.description?.toString()
                });
            });
            body = { type: 'form-data', formData: fd };
        } else if (mode === 'urlencoded' && pmReq.body.urlencoded) {
            const ue: KeyValuePair[] = [];
            pmReq.body.urlencoded.each((u) => {
                ue.push({
                    id: uuidv4(),
                    key: u.key || '',
                    value: u.value ? String(u.value) : '',
                    isActive: !u.disabled,
                    description: u.description ? u.description.toString() : undefined
                });
            });
            body = { type: 'x-www-form-urlencoded', urlencoded: ue };
        }
    }

    const request: HttpRequest = {
        id: reqItem.id || uuidv4(),
        name: reqItem.name || 'Untitled Request',
        method,
        url,
        headers,
        queryParams,
        body,
        parentId
    };

    return request;
}

function getLanguageFromOptions(options: any): 'json' | 'text' | 'xml' | 'html' | 'javascript' {
    if (!options || !options.raw || !options.raw.language) return 'text';
    const lang = options.raw.language.toLowerCase();
    switch (lang) {
        case 'json': return 'json';
        case 'xml': return 'xml';
        case 'html': return 'html';
        case 'javascript': return 'javascript';
        default: return 'text';
    }
}

/**
 * Replaces Postman variables {{var}} with actual values from env object.
 */
export function resolveVariables(text: string, env: Record<string, string>): string {
    if (!text) return text;
    // Regex matches {{variable_name}}
    return text.replace(/\{\{([^}]+)\}\}/g, (match, p1) => {
        const key = p1.trim();
        return env[key] !== undefined ? env[key] : match;
    });
}
