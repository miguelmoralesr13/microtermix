import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProjectEnvStore {
    activeEnv: string;
    envs: Record<string, Record<string, string>>; // { dev: { KEY: VAL }, qa: {...} }
}

const storageKey = (projectPath: string) =>
    `microtermix-envs-${projectPath.replace(/[/\\:]/g, '_')}`;

const defaultStore = (): ProjectEnvStore => ({
    activeEnv: 'dev',
    envs: { dev: {} },
});

/** Elimina claves inválidas: vacías, que empiecen con # o que contengan # */
function sanitizeEnvVars(vars: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(vars)) {
        const key = k.trim();
        if (key && !key.includes('#')) {
            out[key] = v;
        }
    }
    return out;
}

function loadStore(projectPath: string): ProjectEnvStore {
    try {
        const raw = localStorage.getItem(storageKey(projectPath));
        if (!raw) return defaultStore();
        const parsed = JSON.parse(raw) as ProjectEnvStore;
        // Limpiar claves con # que puedan haber quedado de versiones anteriores
        for (const envName of Object.keys(parsed.envs)) {
            parsed.envs[envName] = sanitizeEnvVars(parsed.envs[envName]);
        }
        if (!parsed.envs[parsed.activeEnv]) parsed.activeEnv = Object.keys(parsed.envs)[0] ?? 'dev';
        return parsed;
    } catch {
        return defaultStore();
    }
}

function saveStore(projectPath: string, store: ProjectEnvStore) {
    localStorage.setItem(storageKey(projectPath), JSON.stringify(store));
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useProjectEnvs(projectPath: string) {
    const [store, setStore] = useState<ProjectEnvStore>(() => loadStore(projectPath));

    // Persist every change
    useEffect(() => {
        saveStore(projectPath, store);
    }, [projectPath, store]);

    const setActiveEnv = useCallback((name: string) => {
        setStore(prev => ({ ...prev, activeEnv: name }));
    }, []);

    const addEnv = useCallback((name: string) => {
        const clean = name.trim().toLowerCase();
        if (!clean) return;
        setStore(prev => ({
            ...prev,
            envs: { ...prev.envs, [clean]: prev.envs[clean] ?? {} },
            activeEnv: clean,
        }));
    }, []);

    const removeEnv = useCallback((name: string) => {
        setStore(prev => {
            const envs = { ...prev.envs };
            delete envs[name];
            if (!Object.keys(envs).length) envs.dev = {};
            const activeEnv = Object.keys(envs).includes(prev.activeEnv)
                ? prev.activeEnv : (Object.keys(envs)[0] ?? 'dev');
            return { activeEnv, envs };
        });
    }, []);

    const setEnvVar = useCallback((env: string, key: string, value: string) => {
        setStore(prev => ({
            ...prev,
            envs: {
                ...prev.envs,
                [env]: { ...prev.envs[env], [key]: value },
            },
        }));
    }, []);

    const deleteEnvVar = useCallback((env: string, key: string) => {
        setStore(prev => {
            const vars = { ...prev.envs[env] };
            delete vars[key];
            return { ...prev, envs: { ...prev.envs, [env]: vars } };
        });
    }, []);

    /** Copy all variables from `sourceEnv` into `targetEnv` (merge, not replace) */
    const copyEnvVars = useCallback((sourceEnv: string, targetEnv: string) => {
        setStore(prev => ({
            ...prev,
            envs: {
                ...prev.envs,
                [targetEnv]: { ...(prev.envs[sourceEnv] ?? {}), ...(prev.envs[targetEnv] ?? {}) },
            },
        }));
    }, []);

    /** Replace `targetEnv` entirely with `sourceEnv` variables */
    const overwriteEnvVars = useCallback((sourceEnv: string, targetEnv: string) => {
        setStore(prev => ({
            ...prev,
            envs: {
                ...prev.envs,
                [targetEnv]: { ...(prev.envs[sourceEnv] ?? {}) },
            },
        }));
    }, []);

    const reloadFromFiles = useCallback(() => {
        return invoke<Record<string, Record<string, string>>>('read_project_envs', { projectPath })
            .then(fileEnvs => {
                setStore(prev => {
                    const merged: Record<string, Record<string, string>> = {};

                    // File values WIN on manual reload (opposite of startup merge)
                    for (const [envName, fileVars] of Object.entries(fileEnvs)) {
                        const persistedVars = prev.envs[envName] ?? {};
                        // Keep manually added keys that aren't in the file, but file wins for shared keys
                        merged[envName] = { ...persistedVars, ...fileVars };
                    }

                    // Keep user-created envs that aren't in files
                    for (const [envName, vars] of Object.entries(prev.envs)) {
                        if (!merged[envName]) merged[envName] = vars;
                    }

                    if (!merged.dev) merged.dev = prev.envs.dev ?? {};

                    const activeEnv = Object.keys(merged).includes(prev.activeEnv)
                        ? prev.activeEnv : (Object.keys(merged)[0] ?? 'dev');

                    return { activeEnv, envs: merged };
                });
            });
    }, [projectPath]);

    const activeVars = store.envs[store.activeEnv] ?? {};
    const envNames = Object.keys(store.envs);

    return {
        store,
        activeEnv: store.activeEnv,
        activeVars,
        envNames,
        setActiveEnv,
        addEnv,
        removeEnv,
        setEnvVar,
        deleteEnvVar,
        copyEnvVars,
        overwriteEnvVars,
        reloadFromFiles,
    };
}
