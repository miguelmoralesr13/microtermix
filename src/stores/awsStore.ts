import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { 
    CwCredentials, 
    CwLogGroup, 
    cwGetLogGroups 
} from '../services/cloudwatchApi';
import { 
    Ec2Instance 
} from '../components/cloudwatch/ec2Types';
import { invoke } from '@tauri-apps/api/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SsmTunnel {
    id: string;
    name: string;
    instanceId: string;
    remoteHost: string;
    remotePort: number;
    localPort: number;
    active: boolean;
}

interface AwsState {
    credentials: CwCredentials | null;
    ec2: {
        instances: Ec2Instance[];
        loading: boolean;
        lastFetched: number | null;
        error: string | null;
    };
    cloudwatch: {
        logGroups: CwLogGroup[];
        loading: boolean;
        lastFetched: number | null;
        error: string | null;
    };
    ssm: {
        tunnels: SsmTunnel[];
        loading: boolean;
    };
}

interface AwsActions {
    setCredentials: (cfg: CwCredentials) => void;
    
    // EC2
    fetchInstances: (force?: boolean) => Promise<void>;
    startInstance: (instanceId: string) => Promise<void>;
    stopInstance: (instanceId: string) => Promise<void>;
    
    // CloudWatch
    fetchLogGroups: (pattern?: string, force?: boolean) => Promise<void>;
    
    // SSM Tunnels
    addTunnel: (tunnel: Omit<SsmTunnel, 'id' | 'active'>) => void;
    removeTunnel: (id: string) => void;
    toggleTunnel: (id: string) => Promise<void>;
    hydrateTunnels: (tunnels: SsmTunnel[]) => void;
}

export const useAwsStore = create<AwsState & AwsActions>()(
    devtools(
        persist(
            (set, get) => ({
                credentials: null,
                ec2: {
                    instances: [],
                    loading: false,
                    lastFetched: null,
                    error: null,
                },
                cloudwatch: {
                    logGroups: [],
                    loading: false,
                    lastFetched: null,
                    error: null,
                },
                ssm: {
                    tunnels: [],
                    loading: false,
                },

                setCredentials: (cfg) => set({ credentials: cfg }),

                fetchInstances: async (force = false) => {
                    const { credentials, ec2 } = get();
                    if (!credentials) return;
                    
                    // Cache check (5 mins)
                    if (!force && ec2.lastFetched && (Date.now() - ec2.lastFetched < 300_000)) return;

                    set(s => ({ ec2: { ...s.ec2, loading: true, error: null } }));
                    try {
                        const rustCreds = {
                            access_key_id: credentials.accessKeyId,
                            secret_access_key: credentials.secretAccessKey,
                            region: credentials.region,
                            session_token: credentials.sessionToken || null,
                        };
                        const res: Ec2Instance[] = await invoke('ec2_list_instances', { credentials: rustCreds });
                        set(s => ({ 
                            ec2: { 
                                ...s.ec2, 
                                instances: res, 
                                lastFetched: Date.now(), 
                                loading: false 
                            } 
                        }));
                    } catch (e: any) {
                        set(s => ({ ec2: { ...s.ec2, error: String(e), loading: false } }));
                    }
                },

                startInstance: async (instanceId) => {
                    const { credentials, fetchInstances } = get();
                    if (!credentials) return;
                    const rustCreds = {
                        access_key_id: credentials.accessKeyId,
                        secret_access_key: credentials.secretAccessKey,
                        region: credentials.region,
                        session_token: credentials.sessionToken || null,
                    };
                    await invoke('ec2_start_instance', { credentials: rustCreds, instanceId });
                    await fetchInstances(true);
                },

                stopInstance: async (instanceId) => {
                    const { credentials, fetchInstances } = get();
                    if (!credentials) return;
                    const rustCreds = {
                        access_key_id: credentials.accessKeyId,
                        secret_access_key: credentials.secretAccessKey,
                        region: credentials.region,
                        session_token: credentials.sessionToken || null,
                    };
                    await invoke('ec2_stop_instance', { credentials: rustCreds, instanceId });
                    await fetchInstances(true);
                },

                fetchLogGroups: async (pattern, force = false) => {
                    const { credentials, cloudwatch } = get();
                    if (!credentials) return;

                    if (!force && cloudwatch.lastFetched && (Date.now() - cloudwatch.lastFetched < 600_000)) return;

                    set(s => ({ cloudwatch: { ...s.cloudwatch, loading: true, error: null } }));
                    try {
                        const res = await cwGetLogGroups(credentials, pattern);
                        set(s => ({ 
                            cloudwatch: { 
                                ...s.cloudwatch, 
                                logGroups: res, 
                                lastFetched: Date.now(), 
                                loading: false 
                            } 
                        }));
                    } catch (e: any) {
                        set(s => ({ cloudwatch: { ...s.cloudwatch, error: String(e), loading: false } }));
                    }
                },

                addTunnel: (t) => {
                    const id = crypto.randomUUID();
                    set(s => ({ 
                        ssm: { 
                            ...s.ssm, 
                            tunnels: [...s.ssm.tunnels, { ...t, id, active: false }] 
                        } 
                    }));
                },

                removeTunnel: (id) => {
                    set(s => ({ 
                        ssm: { 
                            ...s.ssm, 
                            tunnels: s.ssm.tunnels.filter(t => t.id !== id) 
                        } 
                    }));
                },

                hydrateTunnels: (tunnels) => {
                    set(s => ({
                        ssm: { ...s.ssm, tunnels: (tunnels || []).map(t => ({ ...t, active: false })) }
                    }));
                },

                toggleTunnel: async (id) => {
                    const { credentials, ssm } = get();
                    if (!credentials) return;
                    
                    const tunnel = ssm.tunnels.find(t => t.id === id);
                    if (!tunnel) return;

                    const serviceId = `ssm-tunnel-${id}`;

                    if (tunnel.active) {
                        await invoke('kill_service', { serviceId });
                        set(s => ({
                            ssm: {
                                ...s.ssm,
                                tunnels: s.ssm.tunnels.map(t => t.id === id ? { ...t, active: false } : t)
                            }
                        }));
                    } else {
                        const rustCreds = {
                            access_key_id: credentials.accessKeyId,
                            secret_access_key: credentials.secretAccessKey,
                            region: credentials.region,
                            session_token: credentials.sessionToken || null,
                        };
                        
                        await invoke('ssm_start_port_forward', {
                            credentials: rustCreds,
                            instanceId: tunnel.instanceId,
                            remoteHost: tunnel.remoteHost,
                            remotePort: tunnel.remotePort,
                            localPort: tunnel.localPort,
                            serviceId,
                            pluginPath: credentials.ssmPluginPath || null
                        });

                        set(s => ({
                            ssm: {
                                ...s.ssm,
                                tunnels: s.ssm.tunnels.map(t => t.id === id ? { ...t, active: true } : t)
                            }
                        }));
                    }
                }
            }),
            {
                name: 'microtermix-aws-store',
                partialize: (s) => ({
                    credentials: s.credentials,
                    // tunnels no se persisten globalmente por petición del usuario
                    ec2: { ...s.ec2, loading: false },
                    cloudwatch: { ...s.cloudwatch, loading: false },
                }),
                onRehydrateStorage: () => (state) => {
                    if (state && !state.credentials) {
                        try {
                            const raw = localStorage.getItem('microtermix-cloudwatch-cfg');
                            if (raw) {
                                const old = JSON.parse(raw);
                                if (old?.accessKeyId) {
                                    state.credentials = old;
                                    localStorage.removeItem('microtermix-cloudwatch-cfg');
                                }
                            }
                        } catch { /* ignore */ }
                    }
                },
            }
        ),
        { name: 'AwsStore' }
    )
);
