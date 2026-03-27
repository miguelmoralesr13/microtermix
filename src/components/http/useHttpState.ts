import { useState, useEffect, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { invoke } from '@tauri-apps/api/core';
import { HttpRequest, HttpResponse, HttpCollectionFolder, HttpEnvironment } from './HttpClientState';
import { parseCurl } from './CurlParser';
import { resolveVariables, parsePostmanCollection } from './PostmanImporter';
import { exportToPostman } from './PostmanExporter';

const LS_KEY = 'microtermix_http_client';

function loadPersistedState() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) return JSON.parse(raw);
    } catch (_) { }
    return null;
}

// Load once at module init — avoids calling JSON.parse 3x
const _initialState = loadPersistedState();

export function useHttpState(workspacePath: string | null) {
    const [request, setRequest] = useState<HttpRequest>(
        _initialState?.request ?? {
            id: uuidv4(),
            name: 'New Request',
            method: 'GET',
            url: '',
            headers: [],
            queryParams: [],
            body: { type: 'none' },
        }
    );


    const [response, setResponse] = useState<HttpResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'params' | 'headers' | 'body'>('params');
    const [collections, setCollections] = useState<HttpCollectionFolder[]>(_initialState?.collections ?? []);
    const [showCurlModal, setShowCurlModal] = useState(false);
    const [curlInput, setCurlInput] = useState('');
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [environments, setEnvironments] = useState<HttpEnvironment[]>(
        _initialState?.environments ?? [
            { id: 'global-1', name: 'Global', variables: {}, isActive: true }
        ]
    );
    const [activeEnvId, setActiveEnvId] = useState<string | null>(
        _initialState?.activeEnvId ?? environments.find(e => e.isActive)?.id ?? environments[0]?.id ?? null
    );
    const [showEnvModal, setShowEnvModal] = useState(false);

    // ---- PERSISTENCE ----

    // 1. Initial hydration from Workspace (Rust)
    useEffect(() => {
        if (!workspacePath) return;

        const loadFromDisk = async () => {
            try {
                const contents = await invoke<string[]>('list_http_collections', { workspacePath });
                if (contents && contents.length > 0) {
                    const loadedFolders: HttpCollectionFolder[] = [];
                    for (const json of contents) {
                        try {
                            const folder = await parsePostmanCollection(json);
                            loadedFolders.push(folder);
                        } catch (e) {
                            console.error("[HTTP Sync] Error parsing workspace collection", e);
                        }
                    }
                    if (loadedFolders.length > 0) {
                        setCollections(loadedFolders);
                        return;
                    }
                }
                
                // If we are here, disk is empty. Let's create a default one to start syncing.
                setCollections([{
                    id: 'workspace-default-store',
                    name: 'Workspace Collections',
                    type: 'collection',
                    items: []
                }]);
            } catch (err) {
                console.error("[HTTP Sync] Failed to load http collections from disk", err);
            }
        };

        loadFromDisk();
    }, [workspacePath]);

    // 2. LocalStorage Fallback (only for stuff not in workspace, like envs)
    useEffect(() => {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({ request, environments, activeEnvId }));
        } catch (_) { }
    }, [request, environments, activeEnvId]);

    // 3. Workspace Auto-Sync (Disk)
    useEffect(() => {
        if (!workspacePath || collections.length === 0) return;

        const timer = setTimeout(async () => {
            for (const col of collections) {
                const filename = `${col.name.replace(/[^a-z0-9]/gi, '_')}.json`;
                const content = exportToPostman(col);
                
                try {
                    await invoke('write_http_collection', { 
                        workspacePath, 
                        filename, 
                        content 
                    });
                } catch (e) {
                    console.error("[HTTP Sync] Error writing collection to disk", e);
                }
            }
        }, 2000); 

        return () => clearTimeout(timer);
    }, [collections, workspacePath]);

    const lastSyncRef = useRef<string>('');

    // 4. Sync current request back to collections tree before switching if it changed
    useEffect(() => {
        if (!request || !request.id || !workspacePath) return;
        
        const currentReqStr = JSON.stringify(request);
        if (lastSyncRef.current === currentReqStr) return;

        const timer = setTimeout(() => {
             setCollections(prev => {
                const newCols = [...prev];
                let found = false;
                const updateRef = (folder: HttpCollectionFolder): boolean => {
                    const idx = folder.items.findIndex(i => !('items' in i) && i.id === request.id);
                    if (idx !== -1) {
                        const existingStr = JSON.stringify(folder.items[idx]);
                        if (existingStr !== currentReqStr) {
                            folder.items[idx] = { ...request };
                            found = true;
                        }
                        return true;
                    }
                    for (const child of folder.items) {
                        if ('items' in child && updateRef(child as HttpCollectionFolder)) return true;
                    }
                    return false;
                };

                for (const col of newCols) {
                    if (updateRef(col)) break;
                }
                
                if (found) {
                    lastSyncRef.current = currentReqStr;
                    return newCols;
                }

                // Auto-add new/unsaved requests to the first collection
                if (newCols.length > 0) {
                    console.log("[HTTP Sync] Auto-adding new request to collection", request.name);
                    newCols[0].items.push({ ...request });
                    lastSyncRef.current = currentReqStr;
                    return newCols;
                }

                return prev;
             });
        }, 1000); 

        return () => clearTimeout(timer);
    }, [request, collections, workspacePath]);


    // -----------------------------------------------------------------------
    // Handlers
    // -----------------------------------------------------------------------

    const handleNewRequest = () => {
        setRequest({
            id: uuidv4(),
            name: 'New Request',
            method: 'GET',
            url: '',
            headers: [],
            queryParams: [],
            body: { type: 'none' },
        });
        setResponse(null);
    };

    const handleImportCurl = () => {
        try {
            const parsed = parseCurl(curlInput);
            setRequest((prev) => ({ ...prev, ...parsed, id: prev.id }));
            setShowCurlModal(false);
            setCurlInput('');
        } catch (e: any) {
            alert(`Error parsing cURL: ${e.message}`);
        }
    };

    const findFirstRequest = (folder: HttpCollectionFolder): HttpRequest | null => {
        for (const item of folder.items) {
            if ('method' in item) return item as HttpRequest;
            const nested = findFirstRequest(item as HttpCollectionFolder);
            if (nested) return nested;
        }
        return null;
    };

    const handleSend = async () => {
        if (!request.url) return;
        setLoading(true);
        setResponse(null);

        try {
            // ---- Resolve Variables ----
            const activeEnv = environments.find(e => e.id === activeEnvId) || environments[0];
            let allVars = { ...activeEnv?.variables };

            // Find parent collection variables
            const findRootCol = (cols: HttpCollectionFolder[], matchId: string): HttpCollectionFolder | null => {
                for (const col of cols) {
                    const checkChild = (folder: HttpCollectionFolder): boolean => {
                        if (folder.items.some(i => i.id === matchId)) return true;
                        for (const child of folder.items) {
                            if ('items' in child && checkChild(child as HttpCollectionFolder)) return true;
                        }
                        return false;
                    };
                    if (checkChild(col)) return col;
                }
                return null;
            };
            const rootCol = findRootCol(collections, request.id);
            if (rootCol && rootCol.variables) {
                // Global vars override collection vars
                allVars = { ...rootCol.variables, ...allVars };
            }

            const resolveText = (text: string) => resolveVariables(text, allVars);

            // Flatten headers into a map
            const headerMap: Record<string, string> = {};
            request.headers
                .filter((h) => h.isActive && h.key)
                .forEach((h) => { headerMap[resolveText(h.key)] = resolveText(h.value); });

            // Build URL with query params
            let finalUrl = resolveText(request.url);
            const activeParams = request.queryParams.filter((p) => p.isActive && p.key);
            if (activeParams.length > 0) {
                const urlObj = new URL(finalUrl.startsWith('http') ? finalUrl : `http://${finalUrl}`);
                activeParams.forEach((p) => urlObj.searchParams.append(resolveText(p.key), resolveText(p.value)));
                finalUrl = urlObj.toString();
            }

            // Body
            let bodyStr: string | undefined;
            if (request.body.type === 'raw' && request.body.raw) {
                bodyStr = resolveText(request.body.raw);
                if (!headerMap['Content-Type'] && request.body.rawLanguage === 'json') {
                    headerMap['Content-Type'] = 'application/json';
                }
            } else if (request.body.type === 'x-www-form-urlencoded' && request.body.urlencoded) {
                const params = new URLSearchParams();
                request.body.urlencoded
                    .filter((p) => p.isActive && p.key)
                    .forEach((p) => params.append(resolveText(p.key), resolveText(p.value)));
                bodyStr = params.toString();
                headerMap['Content-Type'] = 'application/x-www-form-urlencoded';
            }

            const res = await invoke<any>('execute_http_request', {
                request: {
                    url: finalUrl,
                    method: request.method,
                    headers: headerMap,
                    body: bodyStr,
                },
            });

            setResponse({
                requestId: request.id,
                status: res.status,
                statusText: res.status_text,
                headers: res.headers || {},
                body: res.body || '',
                timeMs: res.time_ms,
                isError: res.is_error,
                errorMsg: res.error_msg,
                timestamp: Date.now(),
            });
        } catch (error: any) {
            setResponse({
                requestId: request.id,
                status: 0,
                statusText: 'Error',
                headers: {},
                body: '',
                timeMs: 0,
                isError: true,
                errorMsg: error.toString(),
                timestamp: Date.now(),
            });
        } finally {
            setLoading(false);
        }
    };

    // Helper for saving the request into a specific folder/collection
    const saveRequestToFolder = (targetFolderId: string | null, requestName: string) => {
        const reqToSave = { ...request, name: requestName };
        const newCols = [...collections];

        if (targetFolderId === null || targetFolderId === 'root') {
            // Save to generic Local Scratchpad
            const localColIndex = newCols.findIndex((c) => c.id === 'local-microtermix-collection');
            if (localColIndex === -1) {
                newCols.push({
                    id: 'local-microtermix-collection',
                    type: 'collection',
                    name: 'Local Scratchpad',
                    items: [reqToSave],
                });
            } else {
                const localCol = { ...newCols[localColIndex], items: [...newCols[localColIndex].items] };
                const exists = localCol.items.findIndex((i) => (i as HttpRequest).id === reqToSave.id);
                if (exists >= 0) {
                    localCol.items[exists] = reqToSave;
                } else {
                    localCol.items.push(reqToSave);
                }
                newCols[localColIndex] = localCol;
            }
        } else {
            // Find deep and insert/update
            const updateRef = (folder: HttpCollectionFolder): boolean => {
                if (folder.id === targetFolderId) {
                    const exists = folder.items.findIndex((i) => (i as HttpRequest).id === reqToSave.id);
                    if (exists >= 0) {
                        folder.items[exists] = reqToSave;
                    } else {
                        folder.items.push(reqToSave);
                    }
                    return true;
                }
                for (let i = 0; i < folder.items.length; i++) {
                    const child = folder.items[i];
                    if ('items' in child) { // is folder
                        const updated = updateRef(child as HttpCollectionFolder);
                        if (updated) return true;
                    }
                }
                return false;
            };

            for (let i = 0; i < newCols.length; i++) {
                if (updateRef(newCols[i])) break;
            }
        }

        setRequest(reqToSave);
        setCollections(newCols);
        setShowSaveDialog(false);
    };

    const availableVariables = useMemo(() => {
        const activeEnv = environments.find(e => e.id === activeEnvId) || environments[0];
        let varsSet = new Set<string>();

        // From environment
        if (activeEnv?.variables) {
            Object.keys(activeEnv.variables).forEach(k => varsSet.add(k));
        }

        // From parent collection
        const findRootCol = (cols: HttpCollectionFolder[], matchId: string): HttpCollectionFolder | null => {
            if (!cols) return null;
            for (const col of cols) {
                const checkChild = (folder: HttpCollectionFolder): boolean => {
                    if (folder.items.some(i => i.id === matchId)) return true;
                    for (const child of folder.items) {
                        if ('items' in child && checkChild(child as HttpCollectionFolder)) return true;
                    }
                    return false;
                };
                if (checkChild(col)) return col;
            }
            return null;
        };

        const rootCol = findRootCol(collections, request.id);
        if (rootCol && rootCol.variables) {
            Object.keys(rootCol.variables).forEach(k => varsSet.add(k));
        }

        return Array.from(varsSet);
    }, [environments, activeEnvId, collections, request.id]);

    return {
        request, setRequest,
        response, setResponse,
        loading, setLoading,
        activeTab, setActiveTab,
        collections, setCollections,
        showCurlModal, setShowCurlModal,
        curlInput, setCurlInput,
        showSaveDialog, setShowSaveDialog,
        environments, setEnvironments,
        activeEnvId, setActiveEnvId,
        availableVariables,
        showEnvModal, setShowEnvModal,
        handleNewRequest,
        handleImportCurl,
        findFirstRequest,
        handleSend,
        saveRequestToFolder,
    };
}
