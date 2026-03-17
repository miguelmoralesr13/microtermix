import React from 'react';
import { Server, Plus, Save, Upload, Download, Settings } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

// State hook
import { useHttpState } from './useHttpState';

// Subcomponents
import { ResizablePanel } from './ResizablePanel';
import { CollectionSidebar } from './CollectionSidebar';
import { RequestUrlBar } from './RequestUrlBar';
import { RequestConfigPanel } from './RequestConfigPanel';
import { ResponsePanel } from './ResponsePanel';
import { SaveDialog } from './SaveDialog';
import { EnvironmentManager } from './EnvironmentManager';

import { parsePostmanCollection } from './PostmanImporter';

export const HttpPanel: React.FC = () => {
    // Single source of truth for state
    const {
        request, setRequest,
        response,
        loading,
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
        saveRequestToFolder
    } = useHttpState();

    // -----------------------------------------------------------------------
    // Handlers (Component Specific)
    // -----------------------------------------------------------------------
    const handleImportPostman = async () => {
        try {
            const filePath = await openDialog({
                directory: false,
                multiple: false,
                filters: [{ name: 'JSON', extensions: ['json'] }],
                title: 'Select Postman Collection v2.1 (JSON)',
            });
            if (filePath === null || Array.isArray(filePath)) return;

            const content = await invoke<string>('read_file_at_path', { path: filePath });
            const folder = await parsePostmanCollection(content);
            setCollections((prev) => [...prev, folder]);

            // Load first request as a preview
            const firstReq = findFirstRequest(folder);
            if (firstReq) setRequest({ ...firstReq, id: uuidv4() });

        } catch (e: any) {
            alert(`Failed importing Postman Collection: ${e.message}`);
        }
    };

    const handleUpdateCollectionVars = (colId: string, vars: Record<string, string>) => {
        setCollections((prev) => prev.map(c => c.id === colId ? { ...c, variables: vars } : c));
    };

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------
    return (
        <div className="flex-1 flex flex-col h-full w-full bg-microtermix-dark text-slate-300">

            {/* ── Top Toolbar ── */}
            <div className="flex-none p-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Server size={20} className="text-microtermix-accent" />
                    <h2 className="text-lg font-semibold text-white tracking-wide">Microtermix HTTP Client</h2>
                </div>
                <div className="flex gap-2 items-center">
                    <button
                        onClick={handleNewRequest}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-slate-800/50 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
                    >
                        <Plus size={14} /> New
                    </button>
                    <button
                        onClick={() => setShowSaveDialog(true)}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-slate-800/50 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
                    >
                        <Save size={14} /> Save
                    </button>
                    <div className="w-px h-6 bg-slate-700 mx-1 self-center" />
                    <button
                        onClick={() => setShowCurlModal(true)}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-slate-800/50 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
                    >
                        <Upload size={14} /> Import cURL
                    </button>
                    <button
                        onClick={handleImportPostman}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-slate-800/50 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
                    >
                        <Download size={14} /> Import Postman
                    </button>

                    <div className="w-px h-6 bg-slate-700 mx-1 self-center" />

                    {/* Environment Selector */}
                    <div className="flex gap-2 items-center">
                        <select
                            value={activeEnvId || ''}
                            onChange={(e) => setActiveEnvId(e.target.value)}
                            className="bg-slate-800/50 border border-slate-700 text-xs font-medium text-slate-300 rounded px-2 py-1.5 outline-none focus:border-microtermix-neon transition-colors cursor-pointer min-w-[120px]"
                        >
                            <option value="">No Environment</option>
                            {environments.map(env => (
                                <option key={env.id} value={env.id}>{env.name}</option>
                            ))}
                        </select>

                        <button
                            onClick={() => setShowEnvModal(true)}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-slate-800/50 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
                            title="Manage Environments"
                        >
                            <Settings size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Main layout (Sidebar ↔ Main Editor) ── */}
            <div className="flex flex-1 overflow-hidden">
                <ResizablePanel direction="horizontal" initialSize={260} minSize={200}>
                    {/* Left Sidebar – Collections */}
                    <CollectionSidebar
                        collections={collections}
                        activeRequestId={request.id}
                        onSelectRequest={(req) => setRequest({ ...req })}
                        onUpdateCollections={setCollections}
                    />

                    {/* Right – Request / Response area */}
                    <div className="flex-1 flex flex-col h-full overflow-hidden">

                        {/* URL Bar Fixed */}
                        <div className="flex-none">
                            <RequestUrlBar
                                request={request}
                                loading={loading}
                                availableVariables={availableVariables}
                                onChange={setRequest}
                                onSend={handleSend}
                            />
                        </div>

                        {/* Request Config (Top) ↕ Response (Bottom) */}
                        <div className="flex-1 overflow-hidden">
                            <ResizablePanel direction="vertical" initialSize={250} minSize={150}>
                                <RequestConfigPanel
                                    request={request}
                                    availableVariables={availableVariables}
                                    activeTab={activeTab}
                                    setActiveTab={setActiveTab}
                                    onChange={setRequest}
                                />

                                <ResponsePanel
                                    response={response}
                                    loading={loading}
                                />
                            </ResizablePanel>
                        </div>
                    </div>
                </ResizablePanel>
            </div>

            {/* ── Modals ── */}
            <SaveDialog
                isOpen={showSaveDialog}
                onClose={() => setShowSaveDialog(false)}
                currentName={request.name}
                collections={collections}
                onSave={saveRequestToFolder}
            />

            <EnvironmentManager
                isOpen={showEnvModal}
                onClose={() => setShowEnvModal(false)}
                environments={environments}
                setEnvironments={setEnvironments}
                collections={collections}
                availableVariables={availableVariables}
                onUpdateCollectionVars={handleUpdateCollectionVars}
            />

            {/* cURL Import Modal */}
            {showCurlModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-xl w-full max-w-2xl flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
                            <h3 className="font-semibold text-slate-200">Import cURL</h3>
                            <button
                                onClick={() => setShowCurlModal(false)}
                                className="text-slate-400 hover:text-white text-xl leading-none"
                            >
                                ×
                            </button>
                        </div>
                        <div className="p-4">
                            <textarea
                                className="w-full h-48 bg-slate-950 border border-slate-700 rounded p-4 font-mono text-sm text-slate-200 outline-none focus:border-microtermix-neon resize-none focus:shadow-[0_0_15px_rgba(56,189,248,0.2)] transition-all"
                                placeholder={`curl -X POST https://api.example.com -H 'Content-Type: application/json' -d '{"key":"value"}'`}
                                value={curlInput}
                                onChange={(e) => setCurlInput(e.target.value)}
                            />
                        </div>
                        <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end gap-3">
                            <button
                                onClick={() => setShowCurlModal(false)}
                                className="px-4 py-2 rounded text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleImportCurl}
                                className="px-4 py-2 rounded text-sm bg-microtermix-neon text-slate-900 font-bold hover:bg-sky-400 transition-colors"
                            >
                                Import Command
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
