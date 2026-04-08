export interface LambdaFunction {
    function_name: string;
    function_arn: string;
    runtime?: string;
    role: string;
    handler?: string;
    code_size: number;
    description?: string;
    timeout?: number;
    memory_size?: number;
    last_modified: string;
    state?: string;
    version: string;
    environment: [string, string][];
}

export interface LambdaInvokeResult {
    status_code: number;
    function_error: string | null;
    log_tail: string | null;
    payload: string;
    executed_version: string | null;
    duration_ms: number | null;
    billed_duration_ms: number | null;
    max_memory_used_mb: number | null;
}

export interface LambdaHistoryItem {
    id: string;
    timestamp: string;
    target: 'aws' | 'local';
    payload: string;
    response: string;
    status: number;
    error: string | null;
    duration: number | null;
}

export interface LambdaHistory {
    executions: LambdaHistoryItem[];
}
