/**
 * Genera un ejemplo JSON basado en un esquema de OpenAPI (Swagger)
 */
export const generateExampleFromSchema = (schema: any, fullSpec: any = {}): any => {
    if (!schema) return null;

    // Manejar referencias ($ref)
    if (schema.$ref) {
        const refPath = schema.$ref.replace('#/', '').split('/');
        let resolved = fullSpec;
        for (const segment of refPath) {
            resolved = resolved?.[segment];
        }
        if (resolved) return generateExampleFromSchema(resolved, fullSpec);
        return {};
    }

    // Manejar composición (allOf, anyOf, oneOf)
    if (schema.allOf) {
        let combined = {};
        for (const sub of schema.allOf) {
            combined = { ...combined, ...generateExampleFromSchema(sub, fullSpec) };
        }
        return combined;
    }

    if (schema.oneOf || schema.anyOf) {
        // Por simplicidad, tomamos el primero
        const sub = (schema.oneOf || schema.anyOf)[0];
        return generateExampleFromSchema(sub, fullSpec);
    }

    const type = schema.type || (schema.properties ? 'object' : 'string');

    switch (type) {
        case 'object':
            const obj: any = {};
            if (schema.properties) {
                for (const [key, prop] of Object.entries(schema.properties)) {
                    obj[key] = generateExampleFromSchema(prop, fullSpec);
                }
            }
            return obj;
        case 'array':
            const items = schema.items ? [generateExampleFromSchema(schema.items, fullSpec)] : [];
            return items;
        case 'string':
            if (schema.example) return schema.example;
            if (schema.enum) return schema.enum[0];
            if (schema.format === 'date-time') return new Date().toISOString();
            if (schema.format === 'uuid') return crypto.randomUUID();
            return "string";
        case 'number':
        case 'integer':
            return 0;
        case 'boolean':
            return true;
        default:
            return null;
    }
};

/**
 * Busca el esquema del request body para un path y método específicos
 */
export const findSchemaInContract = (spec: any, path: string, method: string): any => {
    if (!spec || !spec.paths) return null;

    const normalizedPath = path.startsWith('/') ? path : '/' + path;
    const pathItem = spec.paths[normalizedPath] || spec.paths[path];
    
    if (!pathItem) return null;

    const operation = pathItem[method.toLowerCase()];
    if (!operation) return null;

    if (operation.requestBody?.content?.['application/json']?.schema) {
        return operation.requestBody.content['application/json'].schema;
    }

    if (operation.parameters) {
        const bodyParam = operation.parameters.find((p: any) => p.in === 'body');
        if (bodyParam?.schema) {
            return bodyParam.schema;
        }
    }

    return null;
};

/**
 * Busca las cabeceras definidas en el contrato para un path y método específicos
 */
export const findHeadersInContract = (spec: any, path: string, method: string): Record<string, string> => {
    if (!spec || !spec.paths) return {};

    const normalizedPath = path.startsWith('/') ? path : '/' + path;
    const pathItem = spec.paths[normalizedPath] || spec.paths[path];
    
    if (!pathItem) return {};

    const operation = pathItem[method.toLowerCase()];
    if (!operation) return {};

    const headers: Record<string, string> = {};

    // Buscar en parámetros de la operación y del path
    const allParams = [...(pathItem.parameters || []), ...(operation.parameters || [])];
    
    allParams.forEach((param: any) => {
        if (param.in === 'header') {
            headers[param.name] = param.schema 
                ? generateExampleFromSchema(param.schema, spec) 
                : (param.type === 'string' ? "string" : "0");
        }
    });

    return headers;
};
