import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { invoke } from '@tauri-apps/api/core';
import { HttpRequest, HttpResponse, HttpCollectionFolder, HttpEnvironment } from './HttpClientState';
import { parseCurl } from './CurlParser';
import { resolveVariables } from './PostmanImporter';

const LS_KEY = 'nexus_http_client';

function loadPersistedState() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) return JSON.parse(raw);
    } catch (_) { }
    return null;
}

// Load once at module init — avoids calling JSON.parse 3x
const _initialState = loadPersistedState();

export function useHttpState() {
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
    const [showEnvModal, setShowEnvModal] = useState(false);

    // ---- Persist on every change ----
    useEffect(() => {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({ request, collections, environments }));
        } catch (_) { }
    }, [request, collections, environments]);


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
            const activeEnv = environments.find(e => e.isActive) || environments[0];
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
            const localColIndex = newCols.findIndex((c) => c.id === 'local-nexus-collection');
            if (localColIndex === -1) {
                newCols.push({
                    id: 'local-nexus-collection',
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
        showEnvModal, setShowEnvModal,
        handleNewRequest,
        handleImportCurl,
        findFirstRequest,
        handleSend,
        saveRequestToFolder,
    };
}
