import { getFullPath, HttpMethod, MockEndpoint, MockNode, useMockStore } from '../../stores/mockStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Box, Code, Save, Trash2, Link } from 'lucide-react';
import React, { useState, useEffect } from 'react';

export const MockEditor: React.FC = () => {
    const { nodes, selectedNodeId, updateNode, deleteNode } = useMockStore();
    const [localNode, setLocalNode] = useState<MockNode | null>(null);
    const [isValidJson, setIsValidJson] = useState(true);

    const currentNode = selectedNodeId ? nodes[selectedNodeId] : null;

    useEffect(() => {
        if (currentNode) {
            setLocalNode(currentNode);
            if (currentNode.type === 'endpoint') {
                try {
                    JSON.parse(currentNode.responseBody);
                    setIsValidJson(true);
                } catch {
                    setIsValidJson(false);
                }
            }
        } else {
            setLocalNode(null);
        }
    }, [currentNode]);

    if (!localNode) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8">
                <Box size={48} className="mb-4 opacity-20" />
                <h3 className="text-sm font-semibold mb-1">Mock Editor</h3>
                <p className="text-xs text-center max-w-sm mb-6">
                    Selecciona una carpeta o un endpoint en el panel izquierdo para editar su configuración y respuesta.
                </p>
                
                <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-4 max-w-md text-left">
                    <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-2">
                        <span className="text-amber-400">💡</span> Tip: Rutas Dinámicas
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                        Puedes crear rutas dinámicas nombrando tus carpetas o endpoints con dos puntos iniciales. 
                        Por ejemplo, nombrar una carpeta como <span className="text-amber-400 font-mono bg-amber-400/10 px-1 rounded">:id</span> hará que intercepte cualquier valor 
                        dinámico en esa posición de la URL.
                    </p>
                </div>
            </div>
        );
    }

    const isFolder = localNode.type === 'folder';
    const isEndpoint = localNode.type === 'endpoint';
    const endpoint = localNode as MockEndpoint;

    const handleSave = () => {
        updateNode(localNode.id, localNode);
    };

    const handleDelete = () => {
        if (confirm(`¿Eliminar ${isFolder ? 'carpeta' : 'endpoint'} "${localNode.name}"?`)) {
            deleteNode(localNode.id);
        }
    };

    const methodColors: Record<HttpMethod, string> = {
        GET: 'text-blue-400',
        POST: 'text-green-400',
        PUT: 'text-yellow-400',
        PATCH: 'text-orange-400',
        DELETE: 'text-red-400',
        OPTIONS: 'text-slate-400',
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-900 border-l border-slate-800 p-6 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
                <div>
                    <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
                        {isFolder ? 'Carpeta' : 'Endpoint'}
                        <span className={`text-sm px-2 py-0.5 rounded font-mono ${localNode.name.startsWith(':') ? 'text-amber-400 bg-amber-400/10 border border-amber-400/20' : 'text-nexus-neon bg-nexus-neon/10'}`}>
                            {localNode.name}
                        </span>
                        {localNode.name.startsWith(':') && (
                            <span className="text-[10px] text-amber-500/70 uppercase tracking-wider font-bold ml-2 border border-amber-500/20 px-1.5 py-0.5 rounded">Ruta Dinámica</span>
                        )}
                    </h2>
                    {isEndpoint && (
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 font-mono">
                            <Link size={10} /> 
                            <span className={methodColors[endpoint.method]}>{endpoint.method}</span>
                            <span className="text-slate-400">{getFullPath(nodes, localNode.id)}</span>
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleSave} className="gap-2 border-nexus-neon text-nexus-neon hover:bg-nexus-neon/10">
                        <Save size={14} /> Guardar Cambios
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleDelete} className="text-slate-500 hover:text-red-400">
                        <Trash2 size={16} />
                    </Button>
                </div>
            </div>

            {/* Form */}
            <div className="max-w-3xl space-y-6">
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nombre</label>
                    <Input 
                        value={localNode.name}
                        onChange={(e) => setLocalNode({ ...localNode, name: e.target.value })}
                        className={`bg-slate-950 ${localNode.name.startsWith(':') ? 'border-amber-500/50 focus-visible:ring-amber-500 text-amber-400 font-mono' : 'border-slate-700'}`}
                    />
                    {localNode.name.startsWith(':') ? (
                        <p className="text-[10px] text-amber-500 mt-1">
                            Este elemento actuará como comodín. Capturará cualquier valor en este nivel de la URL.
                        </p>
                    ) : (
                        <p className="text-[10px] text-slate-500 mt-1">
                            💡 tip: Empieza el nombre con <span className="text-amber-400 font-mono">:</span> para crear una ruta dinámica (ej. <span className="text-amber-400 font-mono">:id</span>).
                        </p>
                    )}
                </div>

                {isEndpoint && (
                    <>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Método</label>
                                <Select 
                                    value={endpoint.method} 
                                    onValueChange={(v) => setLocalNode({ ...localNode, method: v as HttpMethod })}
                                >
                                    <SelectTrigger className="bg-slate-950 border-slate-700">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.keys(methodColors).map(m => (
                                            <SelectItem key={m} value={m}>
                                                <span className={`font-bold ${methodColors[m as HttpMethod]}`}>{m}</span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Status Code</label>
                                <Input 
                                    type="number"
                                    value={endpoint.statusCode}
                                    onChange={(e) => setLocalNode({ ...localNode, statusCode: parseInt(e.target.value) || 200 })}
                                    className="bg-slate-950 border-slate-700"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Retraso (ms)</label>
                                <Input 
                                    type="number"
                                    value={endpoint.delayMs}
                                    onChange={(e) => setLocalNode({ ...localNode, delayMs: parseInt(e.target.value) || 0 })}
                                    className="bg-slate-950 border-slate-700"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Segmento de Ruta URL</label>
                            <Input 
                                value={endpoint.route}
                                onChange={(e) => setLocalNode({ ...localNode, route: e.target.value })}
                                className="bg-slate-950 border-slate-700 font-mono text-sm"
                            />
                            <p className="text-[10px] text-slate-500 mt-1">El path parcial de este endpoint particular. (ej. "get-users" o "profile")</p>
                        </div>

                        <div className="flex-1 flex flex-col min-h-[300px]">
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <Code size={12} /> Response Body (JSON)
                                </label>
                                {!isValidJson && <span className="text-red-400 text-xs font-medium">JSON Inválido</span>}
                            </div>
                            <Textarea 
                                value={endpoint.responseBody}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setLocalNode({ ...localNode, responseBody: val });
                                    try {
                                        JSON.parse(val);
                                        setIsValidJson(true);
                                    } catch {
                                        setIsValidJson(false);
                                    }
                                }}
                                className={`flex-1 min-h-[300px] font-mono text-sm resize-none bg-slate-950 ${!isValidJson ? 'border-red-500/50 focus-visible:ring-red-500' : 'border-slate-700'}`}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
