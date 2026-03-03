export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface KeyValuePair {
    id: string;
    key: string;
    value: string;
    isActive: boolean;
    description?: string;
}

export type BodyType = 'none' | 'raw' | 'form-data' | 'x-www-form-urlencoded';

export interface HttpBody {
    type: BodyType;
    raw?: string;
    formData?: KeyValuePair[];
    urlencoded?: KeyValuePair[];
    rawLanguage?: 'json' | 'text' | 'xml' | 'html' | 'javascript';
}

export interface HttpRequest {
    id: string;
    name: string;
    method: HttpMethod;
    url: string;
    headers: KeyValuePair[];
    queryParams: KeyValuePair[];
    body: HttpBody;
    parentId?: string; // For linking to a collection folder
}

export interface HttpResponse {
    requestId: string;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    timeMs: number;
    isError: boolean;
    errorMsg?: string;
    timestamp: number;
}

// Tree view for collections
export interface HttpCollectionFolder {
    id: string;
    name: string;
    items: (HttpRequest | HttpCollectionFolder)[];
    type: 'folder' | 'collection';
    variables?: Record<string, string>;
}

export interface HttpEnvironment {
    id: string;
    name: string;
    variables: Record<string, string>;
    isActive: boolean;
}
