export interface ApiHistoryItem {
    id: string;
    timestamp: string;
    method: string;
    path: string;
    url: string;
    headers: Record<string, string>;
    body: string | null;
    response?: {
        status: number;
        body: string;
        duration_ms: number;
        headers: Record<string, string>;
    };
    sign: boolean;
}

export interface ApiHistory {
    executions: ApiHistoryItem[];
}
