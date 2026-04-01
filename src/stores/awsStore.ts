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

export interface AwsAccount extends CwCredentials {
    id: string;
    name: string;
    status?: 'valid' | 'expired' | 'unknown';
}

interface AwsState {
    accounts: AwsAccount[];
    activeAccountId: string | null;
    credentials: CwCredentials | null; // Compatibility getter
    ssm: {
        tunnels: SsmTunnel[];
        loading: boolean;
    };
    globalSettings: {
        ssmPluginPath: string | null;
    };
}

interface AwsActions {
    addAccount: (account: Omit<AwsAccount, 'id'>) => string;
    updateAccount: (id: string, patch: Partial<Omit<AwsAccount, 'id'>>) => void;
    removeAccount: (id: string) => void;
    setActiveAccount: (id: string | null) => void;
    setCredentials: (cfg: CwCredentials) => void; // Legacy support
    _updateCredentials: () => void;
    
    // SSM Tunnels
    addTunnel: (tunnel: Omit<SsmTunnel, 'id' | 'active'>) => void;
    removeTunnel: (id: string) => void;
    toggleTunnel: (id: string) => Promise<void>;
    hydrateTunnels: (tunnels: SsmTunnel[]) => void;
    updateGlobalSettings: (patch: Partial<AwsState['globalSettings']>) => void;
    setAccountStatus: (id: string, status: 'valid' | 'expired' | 'unknown') => void;
}

export const useAwsStore = create<AwsState & AwsActions>()(
    devtools(
        persist(
            (set, get) => ({
                accounts: [],
                activeAccountId: null,
                credentials: null,
                ssm: {
                    tunnels: [],
                    loading: false,
                },
                globalSettings: {
                    ssmPluginPath: null,
                },

                _updateCredentials: () => {
                    const { accounts, activeAccountId } = get();
                    const active = accounts.find(a => a.id === activeAccountId) || null;
                    set({ credentials: active });
                },

                addAccount: (acc) => {
                    const id = crypto.randomUUID();
                    const newAccount = { ...acc, id, status: 'unknown' as const };
                    set(s => ({ 
                        accounts: [...s.accounts, newAccount],
                        activeAccountId: s.activeAccountId || id
                    }));
                    get()._updateCredentials();
                    return id;
                },

                updateAccount: (id, patch) => {
                    set(s => ({
                        accounts: s.accounts.map(a => a.id === id ? { ...a, ...patch } : a)
                    }));
                    get()._updateCredentials();
                },

                removeAccount: (id) => {
                    set(s => {
                        const newAccounts = s.accounts.filter(a => a.id !== id);
                        const newActiveId = s.activeAccountId === id ? (newAccounts[0]?.id || null) : s.activeAccountId;
                        return {
                            accounts: newAccounts,
                            activeAccountId: newActiveId
                        };
                    });
                    get()._updateCredentials();
                },

                setActiveAccount: (id) => {
                    set({ activeAccountId: id });
                    get()._updateCredentials();
                },

                setCredentials: (cfg) => {
                    // Legacy: convert single credentials to an account if none exists
                    const { accounts } = get();
                    if (accounts.length === 0) {
                        get().addAccount({ ...cfg, name: 'Default' });
                    } else if (get().activeAccountId) {
                        get().updateAccount(get().activeAccountId!, cfg);
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
                            pluginPath: credentials.ssmPluginPath || get().globalSettings.ssmPluginPath || null
                        });

                        set(s => ({
                            ssm: {
                                ...s.ssm,
                                tunnels: s.ssm.tunnels.map(t => t.id === id ? { ...t, active: true } : t)
                            }
                        }));
                    }
                },

                updateGlobalSettings: (patch) => {
                    set(s => ({
                        globalSettings: { ...s.globalSettings, ...patch }
                    }));
                },

                setAccountStatus: (id, status) => {
                    set(s => ({
                        accounts: s.accounts.map(a => a.id === id ? { ...a, status } : a)
                    }));
                    get()._updateCredentials();
                }
            }),
            {
                name: 'microtermix-aws-store',
                partialize: (s) => ({
                    accounts: s.accounts,
                    activeAccountId: s.activeAccountId,
                    globalSettings: s.globalSettings,
                }),
                onRehydrateStorage: () => (state) => {
                    if (state) {
                        // After hydration, ensure credentials is set based on activeAccountId
                        const active = state.accounts.find(a => a.id === state.activeAccountId) || null;
                        state.credentials = active;

                        if (state.accounts.length === 0) {
                            try {
                                const raw = localStorage.getItem('microtermix-cloudwatch-cfg');
                                if (raw) {
                                    const old = JSON.parse(raw);
                                    if (old?.accessKeyId) {
                                        state.addAccount({ ...old, name: 'Imported' });
                                        localStorage.removeItem('microtermix-cloudwatch-cfg');
                                    }
                                }
                            } catch { /* ignore */ }
                        }
                    }
                },
            }
        ),
        { name: 'AwsStore' }
    )
);
