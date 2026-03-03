import React, { useState } from 'react';
import { Folder, ChevronRight, ChevronDown, Plus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { HttpRequest, HttpCollectionFolder } from './HttpClientState';

interface CollectionSidebarProps {
    collections: HttpCollectionFolder[];
    activeRequestId: string;
    onSelectRequest: (req: HttpRequest) => void;
    onUpdateCollections: (collections: HttpCollectionFolder[]) => void;
}

const CollectionTreeItem: React.FC<{
    item: HttpCollectionFolder | HttpRequest;
    activeRequestId: string;
    onSelectRequest: (req: HttpRequest) => void;
    onAddSubfolder: (parentId: string, name: string) => void;
    depth?: number;
}> = ({ item, activeRequestId, onSelectRequest, onAddSubfolder, depth = 0 }) => {
    const isFolder = 'items' in item;
    const [expanded, setExpanded] = useState(false);
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');

    if (!isFolder) {
        const req = item as HttpRequest;
        const methodColors: Record<string, string> = {
            GET: 'text-green-400', POST: 'text-yellow-400', PUT: 'text-blue-400', DELETE: 'text-red-400', PATCH: 'text-purple-400',
        };
        const isActive = req.id === activeRequestId;
        return (
            <div
                onClick={() => onSelectRequest(req)}
                className={`group flex items-center gap-2 py-1.5 px-2 cursor-pointer transition-colors text-sm rounded ${isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                title={req.url}
            >
                <div className={`text-[10px] font-bold w-10 shrink-0 ${methodColors[req.method] || 'text-slate-400'}`}>
                    {req.method}
                </div>
                <div className="truncate flex-1">{req.name}</div>
            </div>
        );
    }

    const folder = item as HttpCollectionFolder;

    const handleCreateFolder = () => {
        if (!newFolderName.trim()) return;
        onAddSubfolder(folder.id, newFolderName.trim());
        setIsCreatingFolder(false);
        setNewFolderName('');
        setExpanded(true);
    };

    return (
        <div className="flex flex-col w-full">
            <div
                className="group flex items-center justify-between py-1.5 px-2 transition-colors text-sm text-slate-300 hover:bg-slate-800/50 rounded font-medium"
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
                <div className="flex items-center gap-1.5 flex-1 cursor-pointer overflow-hidden" onClick={() => setExpanded(!expanded)}>
                    <div className="text-slate-500 w-4 flex justify-center shrink-0">
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </div>
                    <Folder size={14} className="text-nexus-accent shrink-0" />
                    <span className="truncate flex-1">{folder.name}</span>
                </div>

                <button
                    onClick={(e) => { e.stopPropagation(); setIsCreatingFolder(!isCreatingFolder); }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-white"
                    title="Add folder"
                >
                    <Plus size={14} />
                </button>
            </div>

            {isCreatingFolder && (
                <div className="flex items-center gap-2 py-1.5 px-2 mt-1 mx-2 bg-slate-800 rounded ring-1 ring-slate-700" style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}>
                    <Folder size={14} className="text-slate-500 shrink-0" />
                    <input
                        type="text"
                        autoFocus
                        placeholder="Folder name..."
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreateFolder();
                            if (e.key === 'Escape') setIsCreatingFolder(false);
                        }}
                        className="bg-transparent text-sm w-full outline-none text-slate-200"
                    />
                </div>
            )}

            {expanded && folder.items.map((subItem) => (
                <CollectionTreeItem
                    key={subItem.id}
                    item={subItem}
                    activeRequestId={activeRequestId}
                    onSelectRequest={onSelectRequest}
                    onAddSubfolder={onAddSubfolder}
                    depth={depth + 1}
                />
            ))}
        </div>
    );
};

export const CollectionSidebar: React.FC<CollectionSidebarProps> = ({
    collections,
    activeRequestId,
    onSelectRequest,
    onUpdateCollections
}) => {
    const [filter, setFilter] = useState('');

    const handleAddSubfolder = (parentId: string, name: string) => {
        const newCols = [...collections];
        const newFolder: HttpCollectionFolder = {
            id: uuidv4(),
            name,
            type: 'folder',
            items: []
        };

        if (parentId === 'root') {
            newCols.push(newFolder);
            onUpdateCollections(newCols);
            return;
        }

        const insertInto = (folder: HttpCollectionFolder): boolean => {
            if (folder.id === parentId) {
                folder.items.push(newFolder);
                return true;
            }
            for (const child of folder.items) {
                if ('items' in child) {
                    if (insertInto(child as HttpCollectionFolder)) return true;
                }
            }
            return false;
        };

        for (const col of newCols) {
            if (insertInto(col)) break;
        }
        onUpdateCollections(newCols);
    };

    return (
        <div className="w-full h-full border-r border-slate-800 bg-slate-900/30 flex flex-col">
            <div className="p-3 border-b border-slate-800 flex flex-col gap-2">
                <input
                    type="text"
                    placeholder="Filter requests..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 focus:border-nexus-neon outline-none"
                />
                <button
                    onClick={() => handleAddSubfolder('root', 'New Collection')}
                    className="flex justify-center items-center gap-1.5 w-full py-1.5 border border-slate-700 border-dashed rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
                >
                    <Plus size={14} /> New Root Collection
                </button>
            </div>
            <div className="flex-1 p-2 overflow-y-auto">
                {collections.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-500 text-sm italic">
                        No collections yet
                    </div>
                ) : (
                    collections.map((col) => (
                        <CollectionTreeItem
                            key={col.id}
                            item={col}
                            activeRequestId={activeRequestId}
                            onSelectRequest={onSelectRequest}
                            onAddSubfolder={handleAddSubfolder}
                        />
                    ))
                )}
            </div>
        </div>
    );
};
