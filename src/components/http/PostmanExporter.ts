import { HttpCollectionFolder, HttpRequest } from './HttpClientState';

export function exportToPostman(collection: HttpCollectionFolder): string {
    const postmanJson = {
        info: {
            name: collection.name,
            schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
        },
        item: collection.items.map(convertItem),
        variable: collection.variables ? Object.entries(collection.variables).map(([k, v]) => ({ key: k, value: v })) : undefined
    };

    return JSON.stringify(postmanJson, null, 2);
}

function convertItem(item: HttpRequest | HttpCollectionFolder): any {
    // If it's a folder or collection
    if ('type' in item && (item.type === 'folder' || item.type === 'collection')) {
        return {
            name: item.name,
            item: item.items.map(convertItem)
        };
    }

    const req = item as HttpRequest;
    
    // Headers processing
    const header = req.headers.map(h => ({
        key: h.key,
        value: h.value,
        type: "text",
        disabled: !h.isActive
    }));

    // URL processing
    const urlObj: any = {
        raw: req.url
    };
    if (req.queryParams && req.queryParams.length > 0) {
        urlObj.query = req.queryParams.map(q => ({
            key: q.key,
            value: q.value,
            disabled: !q.isActive
        }));
    }

    // Body processing
    let body: any = undefined;
    if (req.body.type !== 'none') {
        if (req.body.type === 'raw') {
            body = {
                mode: "raw",
                raw: req.body.raw || "",
                options: {
                    raw: {
                        language: req.body.rawLanguage === 'json' ? 'json' : (req.body.rawLanguage || 'text')
                    }
                }
            };
        } else if (req.body.type === 'form-data') {
            body = {
                mode: "formdata",
                formdata: (req.body.formData || []).map(f => ({
                    key: f.key,
                    value: f.value,
                    type: "text",
                    disabled: !f.isActive
                }))
            };
        } else if (req.body.type === 'x-www-form-urlencoded') {
            body = {
                mode: "urlencoded",
                urlencoded: (req.body.urlencoded || []).map(u => ({
                    key: u.key,
                    value: u.value,
                    type: "text",
                    disabled: !u.isActive
                }))
            };
        }
    }

    return {
        name: req.name,
        request: {
            method: req.method,
            header,
            body,
            url: urlObj
        }
    };
}
