import React from 'react';
import { useMockStore } from '../../stores/mockStore';
import { Button } from '@/components/ui/button';
import { FolderPlus, FilePlus, Folder, FileJson, ChevronDown, ChevronRight, Server } from 'lucide-react';

const TreeNode: React.FC<{
    nodeId: string;
    depth: number;
    nodes: Record<string, any>;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onAddEndpoint: (pid: string) => void;
    onAddFolder: (pid: string) => void;
}> = ({ nodeId, depth, nodes, selectedId, onSelect, onAddEndpoint, onAddFolder }) => {
    const node = nodes[nodeId];
    if (!node) return null;

    const isFolder = node.type === 'folder';
    const isSelected = selectedId === nodeId;
    const [expanded, setExpanded] = React.useState(true);

    const children = Object.values(nodes)
        .filter((n: any) => n.parentId === nodeId)
        .sort((a: any, b: any) => {
            // Folders first
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

    return (
        <div className="w-full">
            <div
                className={`flex items-center gap-1.5 py-1 px-1 rounded cursor-pointer group ${isSelected ? 'bg-microtermix-neon/10 text-microtermix-neon' : 'text-slate-300 hover:bg-slate-800/50'}`}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={(e) => { e.stopPropagation(); onSelect(nodeId); }}
            >
                {/* Expand toggler for folders */}
                <span
                    className={`shrink-0 w-4 h-4 flex items-center justify-center ${isFolder ? 'cursor-pointer hover:text-white' : 'opacity-0'}`}
                    onClick={(e) => {
                        if (isFolder) {
                            e.stopPropagation();
                            setExpanded(!expanded);
                        }
                    }}
                >
                    {isFolder && (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                </span>

                {/* Icon */}
                <span className="shrink-0 text-slate-500">
                    {isFolder ? <Folder size={14} className={isSelected ? 'text-microtermix-neon' : ''} /> : <FileJson size={14} className={isSelected ? 'text-microtermix-neon' : ''} />}
                </span>

                {/* Name */}
                <span className={`flex-1 text-xs truncate ${node.name.startsWith(':') ? 'text-amber-400 font-mono font-medium' : ''}`}>
                    {node.name}
                </span>

                {/* Contextual actions */}
                {isFolder && (
                    <div className="opacity-0 group-hover:opacity-100 flex items-center pr-1 shrink-0">
                        <Button variant="ghost" size="icon-sm" className="h-5 w-5 hover:text-microtermix-neon" onClick={(e) => { e.stopPropagation(); onAddFolder(nodeId); }} title="Nueva Carpeta">
                            <FolderPlus size={12} />
                        </Button>
                        <Button variant="ghost" size="icon-sm" className="h-5 w-5 hover:text-microtermix-neon" onClick={(e) => { e.stopPropagation(); onAddEndpoint(nodeId); }} title="Nuevo Endpoint">
                            <FilePlus size={12} />
                        </Button>
                    </div>
                )}

                {node.type === 'endpoint' && (
                    <span className="text-[9px] font-mono px-1 rounded bg-slate-800 text-slate-400 mr-2 shrink-0">
                        {node.method}
                    </span>
                )}
            </div>

            {/* Recursion */}
            {isFolder && expanded && children.map((child: any) => (
                <TreeNode
                    key={child.id}
                    nodeId={child.id}
                    depth={depth + 1}
                    nodes={nodes}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onAddEndpoint={onAddEndpoint}
                    onAddFolder={onAddFolder}
                />
            ))}
        </div>
    );
};

export const MockSidebar: React.FC = () => {
    const { nodes, selectedNodeId, setSelectedNodeId, addFolder, addEndpoint } = useMockStore();

    const rootNodes = Object.values(nodes)
        .filter((n: any) => n.parentId === null)
        .sort((a: any, b: any) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

    return (
        <div className="w-64 shrink-0 flex flex-col bg-slate-950/30 overflow-hidden">
            <div className="px-3 py-3 border-b border-slate-800/60 bg-slate-950/50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <Server size={14} className="text-microtermix-neon" />
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Mocks</h3>
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-sm" className="h-6 w-6 hover:text-microtermix-neon hover:bg-slate-800" onClick={() => addFolder(null, 'Nueva Carpeta')} title="Nueva Carpeta Raíz">
                        <FolderPlus size={14} />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="h-6 w-6 hover:text-microtermix-neon hover:bg-slate-800" onClick={() => addEndpoint(null, 'Nuevo Endpoint')} title="Nuevo Endpoint Raíz">
                        <FilePlus size={14} />
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
                {rootNodes.length === 0 ? (
                    <div className="p-4 text-center">
                        <p className="text-xs text-slate-500 italic">No hay endpoints simulados.</p>
                        <p className="text-[10px] text-slate-600 mt-1">Crea una carpeta o endpoint para comenzar.</p>
                    </div>
                ) : (
                    rootNodes.map((node: any) => (
                        <TreeNode
                            key={node.id}
                            nodeId={node.id}
                            depth={0}
                            nodes={nodes}
                            selectedId={selectedNodeId}
                            onSelect={setSelectedNodeId}
                            onAddEndpoint={(pid) => addEndpoint(pid, 'Nuevo Endpoint')}
                            onAddFolder={(pid) => addFolder(pid, 'Nueva Carpeta')}
                        />
                    ))
                )}
            </div>
        </div>
    );
};
