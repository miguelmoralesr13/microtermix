import React, { useState } from 'react';
import { Folder } from 'lucide-react';
import { HttpCollectionFolder } from './HttpClientState';

interface SaveDialogProps {
    isOpen: boolean;
    onClose: () => void;
    currentName: string;
    collections: HttpCollectionFolder[];
    onSave: (folderId: string | null, requestName: string) => void;
}

export const SaveDialog: React.FC<SaveDialogProps> = ({
    isOpen,
    onClose,
    currentName,
    collections,
    onSave,
}) => {
    const [name, setName] = useState(currentName);
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>('root');

    if (!isOpen) return null;

    const handleSubmit = () => {
        if (!name.trim()) return;
        onSave(selectedFolderId, name.trim());
    };

    // Flatten collections tree for select dropdown
    const renderFolderOptions = () => {
        const options: React.ReactElement[] = [];

        const traverse = (folder: HttpCollectionFolder, depth: number) => {
            const indent = '—'.repeat(depth);
            options.push(
                <option key={folder.id} value={folder.id}>
                    {depth > 0 ? `${indent} ` : ''}{folder.name}
                </option>
            );

            folder.items.forEach(child => {
                if ('items' in child) {
                    traverse(child as HttpCollectionFolder, depth + 1);
                }
            });
        };

        collections.forEach(col => traverse(col, 0));
        return options;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-xl w-full max-w-sm flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
                    <h3 className="font-semibold text-slate-200">Save Request</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
                </div>

                <div className="p-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-slate-400 font-semibold tracking-wide uppercase">Request Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 outline-none focus:border-nexus-neon"
                            placeholder="My Awesome Request"
                            autoFocus
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-slate-400 font-semibold tracking-wide uppercase">Save to</label>
                        <div className="relative">
                            <Folder size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <select
                                value={selectedFolderId || 'root'}
                                onChange={(e) => setSelectedFolderId(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded pl-9 pr-3 py-2 text-sm text-slate-200 outline-none focus:border-nexus-neon appearance-none cursor-pointer"
                            >
                                <option value="root">Root / Local Scratchpad</option>
                                {renderFolderOptions()}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!name.trim()}
                        className="px-4 py-2 rounded text-sm bg-nexus-neon text-slate-900 font-bold hover:bg-sky-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};
