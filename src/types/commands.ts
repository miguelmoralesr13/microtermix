export interface CommandStep {
    id: string;
    type: 'env' | 'command';
    value: string;
}
