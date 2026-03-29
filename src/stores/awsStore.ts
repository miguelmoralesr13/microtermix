import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { 
    CwCredentials, 
} from '../services/cloudwatchApi';
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
    ssm: {
        tunnels: SsmTunnel[];
        loading: boolean;
    };
}

interface AwsActions {
    setCredentials: (cfg: CwCredentials) => void;
    
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
                ssm: {
                    tunnels: [],
                    loading: false,
                },

                setCredentials: (cfg) => set({ credentials: cfg }),

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
