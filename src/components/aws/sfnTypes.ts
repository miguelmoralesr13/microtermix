export interface SfnHistoryItem {
    id: string;
    timestamp: string;
    target: 'aws' | 'local';
    input: string;
    executionArn: string;
    status: string;
}

export interface SfnHistory {
    executions: SfnHistoryItem[];
}
