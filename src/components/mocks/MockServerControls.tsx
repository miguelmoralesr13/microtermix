import React from 'react';
import { useMockStore, MockEndpoint } from '../../stores/mockStore';
import { Button } from '@/components//ui/button';
import { Input } from '@/components//ui/input';
import { Play, Square, Settings2, Server } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export const MockServerControls: React.FC = () => {
    const { nodes, serverRunning, serverPort, setServerRunning, setServerPort } = useMockStore();

    const handleToggleServer = async () => {
        try {
            if (serverRunning) {
                await invoke('stop_mock_server');
                setServerRunning(false);
            } else {
                // Collect all endpoints to send to Rust
                const endpoints = Object.values(nodes)
                    .filter(n => n.type === 'endpoint')
                    .map(n => {
                        const ep = n as MockEndpoint;
                        // Build full path recursively (simplified representation for Rust payload)
                        let fullPath = ep.route;
                        let curr = nodes[ep.parentId || ''];
                        while (curr) {
                            if (curr.type === 'folder') {
                                fullPath = `${curr.name}/${fullPath}`;
                            }
                            curr = nodes[curr.parentId || ''];
                        }
                        return {
                            method: ep.method,
                            route: `/${fullPath}`.replace(/\/+/g, '/'), // normalize slashes
                            status_code: ep.statusCode,
                            response_body: ep.responseBody,
                            delay_ms: ep.delayMs,
                            headers: ep.headers,
                        };
                    });

                await invoke('start_mock_server', {
                    port: serverPort,
                    endpoints,
                });
                setServerRunning(true);
            }
        } catch (error) {
            console.error("Failed to toggle mock server:", error);
            // Could add a toast notification here
        }
    };

    return (
        <div className="h-12 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-6 h-6 rounded bg-indigo-500/20 text-indigo-400">
                    <Server size={14} />
                </div>
                <div>
                    <h2 className="text-sm font-bold text-slate-200 leading-none">Generador de Mocks</h2>
                    <p className="text-[10px] text-slate-500 mt-0.5">Levanta un servidor local con JSON simulados</p>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Puerto</label>
                    <Input
                        type="number"
                        value={serverPort}
                        onChange={(e) => setServerPort(parseInt(e.target.value) || 3005)}
                        disabled={serverRunning}
                        className="w-20 h-7 text-xs bg-slate-900 border-slate-700"
                    />
                </div>

                <Button
                    variant={serverRunning ? "destructive" : "default"}
                    size="sm"
                    className={`h-7 px-3 text-xs font-bold gap-1.5 ${!serverRunning ? 'bg-microtermix-neon text-slate-900 hover:bg-[#00ffd5]' : ''}`}
                    onClick={handleToggleServer}
                >
                    {serverRunning ? (
                        <>
                            <Square size={12} fill="currentColor" /> Detener Servidor
                        </>
                    ) : (
                        <>
                            <Play size={12} fill="currentColor" /> Iniciar Mocks
                        </>
                    )}
                </Button>

                <Button variant="ghost" size="icon-sm" className="h-7 w-7 text-slate-500 hover:text-slate-300">
                    <Settings2 size={14} />
                </Button>
            </div>
        </div>
    );
};
