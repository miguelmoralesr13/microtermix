import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { useAwsStore } from './awsStore';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SsmParameter {
    name: string;
    type_: string;
    last_modified: number | null;
    value?: string;
}

export interface AwsSecret {
    name: string;
    description: string | null;
    last_modified: number | null;
    value?: string;
}

interface AwsEnvState {
    parameters: SsmParameter[];
    secrets: AwsSecret[];
    loading: boolean;
    error: string | null;
}

interface AwsEnvActions {
    fetchParameters: () => Promise<void>;
    fetchSecrets: () => Promise<void>;
    fetchParameterValue: (name: string) => Promise<string>;
    fetchSecretValue: (name: string) => Promise<string>;
    clearCache: () => void;
}

export const useAwsEnvStore = create<AwsEnvState & AwsEnvActions>()(
    devtools(
        (set, get) => ({
            parameters: [],
            secrets: [],
            loading: false,
            error: null,

            fetchParameters: async () => {
                const credentials = useAwsStore.getState().credentials;
                if (!credentials) return;

                set({ loading: true, error: null });
                try {
                    const rustCreds = {
                        access_key_id: credentials.accessKeyId,
                        secret_access_key: credentials.secretAccessKey,
                        region: credentials.region,
                        session_token: credentials.sessionToken || null,
                    };

                    const params = await invoke<SsmParameter[]>('ssm_list_parameters', {
                        credentials: rustCreds
                    });

                    set({ parameters: params, loading: false });
                } catch (err: any) {
                    set({ error: err.toString(), loading: false });
                }
            },

            fetchSecrets: async () => {
                const credentials = useAwsStore.getState().credentials;
                if (!credentials) return;

                set({ loading: true, error: null });
                try {
                    const rustCreds = {
                        access_key_id: credentials.accessKeyId,
                        secret_access_key: credentials.secretAccessKey,
                        region: credentials.region,
                        session_token: credentials.sessionToken || null,
                    };

                    const secrets = await invoke<AwsSecret[]>('secrets_list_secrets', {
                        credentials: rustCreds
                    });

                    set({ secrets: secrets, loading: false });
                } catch (err: any) {
                    set({ error: err.toString(), loading: false });
                }
            },

            fetchParameterValue: async (name: string) => {
                const credentials = useAwsStore.getState().credentials;
                if (!credentials) throw new Error('No credentials');

                const cached = get().parameters.find(p => p.name === name)?.value;
                if (cached) return cached;

                const rustCreds = {
                    access_key_id: credentials.accessKeyId,
                    secret_access_key: credentials.secretAccessKey,
                    region: credentials.region,
                    session_token: credentials.sessionToken || null,
                };

                const val = await invoke<string>('ssm_get_parameter_value', {
                    credentials: rustCreds,
                    name
                });

                set(s => ({
                    parameters: s.parameters.map(p => p.name === name ? { ...p, value: val } : p)
                }));

                return val;
            },

            fetchSecretValue: async (name: string) => {
                const credentials = useAwsStore.getState().credentials;
                if (!credentials) throw new Error('No credentials');

                const cached = get().secrets.find(s => s.name === name)?.value;
                if (cached) return cached;

                const rustCreds = {
                    access_key_id: credentials.accessKeyId,
                    secret_access_key: credentials.secretAccessKey,
                    region: credentials.region,
                    session_token: credentials.sessionToken || null,
                };

                const val = await invoke<string>('secrets_get_secret_value', {
                    credentials: rustCreds,
                    secretId: name
                });

                set(s => ({
                    secrets: s.secrets.map(sec => sec.name === name ? { ...sec, value: val } : sec)
                }));

                return val;
            },

            clearCache: () => {
                set({ parameters: [], secrets: [], error: null });
            }
        }),
        { name: 'AwsEnvStore' }
    )
);
