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
