import { CwCredentials } from '../../services/cloudwatchApi';

export type Ec2StateFilter = 'all' | 'running' | 'stopped';

export interface Ec2Tag {
    key: string;
    value: string;
}

export interface Ec2Instance {
    instance_id: string;
    name: string | null;
    state: string;
    state_code: number;
    instance_type: string;
    public_ip: string | null;
    private_ip: string | null;
    key_name: string | null;
    launch_time: string | null;
    availability_zone: string | null;
    image_id: string | null;
    platform: string | null;
    vpc_id: string | null;
    subnet_id: string | null;
    tags: Ec2Tag[];
}

export interface SshDefaults {
    username: string;
    keyPath: string;
    port: number;
}

export interface SshSession {
    serviceId: string;
    inst: Ec2Instance;
    sshCmd: string;
    connected: boolean;
}

export interface LogLine {
    text: string;
    isError: boolean;
}

export const SSH_KEY = 'nexus-ec2-ssh';

export function loadSshDefaults(): SshDefaults {
    try {
        const raw = localStorage.getItem(SSH_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { username: 'ec2-user', keyPath: '', port: 22 };
}

export function saveSshDefaults(s: SshDefaults) {
    localStorage.setItem(SSH_KEY, JSON.stringify(s));
}

export function toEc2Rust(cfg: CwCredentials) {
    return {
        access_key_id: cfg.accessKeyId,
        secret_access_key: cfg.secretAccessKey,
        region: cfg.region,
        session_token: cfg.sessionToken ?? null,
    };
}

export function ec2StateColor(state: string): string {
    switch (state) {
        case 'running': return '#22c55e';
        case 'stopped': return '#ef4444';
        case 'stopping': case 'pending': case 'shutting-down': return '#f59e0b';
        case 'terminated': return '#475569';
        default: return '#6b7280';
    }
}

export function formatLaunchTime(iso: string | null): string {
    if (!iso) return '–';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString();
}
