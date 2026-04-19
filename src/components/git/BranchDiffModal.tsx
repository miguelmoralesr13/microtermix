import React, { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, GitCompare, ChevronDown } from 'lucide-react';
import { FileDiffPanel, DiffFile } from './shared/FileDiffPanel';
import { computeDiff, buildHunks, Hunk } from './utils/diffRenderer';
import { useBranchDiffFiles } from '../../hooks/queries/useGitQueries';

interface BranchDiffModalProps {
    projectPath: string;
    initialBase?: string;
    initialHead?: string;
    branches: string[];
    onClose: () => void;
}

function BranchSelect({ value, onChange, options, exclude, label }: {
    value: string;
    onChange: (v: string) => void;
    options: string[];
    exclude?: string;
    label: string;
}) {
    const filtered = options.filter(b => b !== exclude);
    return (
        <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold shrink-0">{label}</span>
            <div className="relative">
                <select
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className="appearance-none bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:border-microtermix-accent cursor-pointer"
                >
                    {filtered.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
        </div>
    );
}

export const BranchDiffModal: React.FC<BranchDiffModalProps> = ({
    projectPath, initialBase = 'main', initialHead = 'HEAD', branches, onClose
}) => {
    const [base, setBase] = useState(initialBase);
    const [head, setHead] = useState(initialHead);
    const [selectedFile, setSelectedFile] = useState<DiffFile | null>(null);
    const [hunks, setHunks] = useState<Hunk[]>([]);
    const [loadingDiff, setLoadingDiff] = useState(false);

    const { data, isLoading, error } = useBranchDiffFiles(projectPath, base, head);
    const files: DiffFile[] = (data?.files ?? []).map(f => ({
        status: f.status,
        path: f.path,
        oldPath: f.oldPath ?? undefined,
    }));

    // Auto-select first file
    useEffect(() => {
        if (files.length > 0 && !selectedFile) {
            setSelectedFile(files[0]);
        }
        if (files.length === 0) {
            setSelectedFile(null);
            setHunks([]);
        }
    }, [data]);

    const loadDiff = useCallback(async (file: DiffFile) => {
        setLoadingDiff(true);
        setHunks([]);
        try {
            const res: any = await invoke('git_branch_diff_file_content', {
                projectPath,
                base,
                head,
                filePath: file.path,
            });
            const oldLines = (res?.original ?? '').split('\n');
            const newLines = (res?.modified ?? '').split('\n');
            setHunks(buildHunks(computeDiff(oldLines, newLines)));
        } catch {
            setHunks([]);
        } finally {
            setLoadingDiff(false);
        }
    }, [projectPath, base, head]);

    const handleSelectFile = (file: DiffFile) => {
        setSelectedFile(file);
        loadDiff(file);
    };

    useEffect(() => {
        if (selectedFile) loadDiff(selectedFile);
    }, [base, head]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const allBranches = branches.length > 0 ? branches : [base, head];

    return (
        <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="flex flex-col w-full max-w-7xl h-[90vh] bg-slate-950 rounded-xl border border-slate-700 shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-800 bg-slate-900/60 shrink-0 flex-wrap">
                    <div className="flex items-center gap-2">
                        <GitCompare size={18} className="text-microtermix-accent shrink-0" />
                        <span className="text-sm font-semibold text-slate-100">Comparar ramas</span>
                    </div>

                    <div className="flex items-center gap-3 flex-1 flex-wrap">
                        <BranchSelect label="Base" value={base} onChange={v => { setBase(v); setSelectedFile(null); }} options={allBranches} exclude={head} />
                        <span className="text-slate-600 text-sm">→</span>
                        <BranchSelect label="Head" value={head} onChange={v => { setHead(v); setSelectedFile(null); }} options={allBranches} exclude={base} />
                        {files.length > 0 && (
                            <span className="text-[11px] text-slate-500">{files.length} archivo{files.length !== 1 ? 's' : ''} cambiado{files.length !== 1 ? 's' : ''}</span>
                        )}
                    </div>

                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ml-auto"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <FileDiffPanel
                    files={files}
                    selectedFile={selectedFile}
                    onSelectFile={handleSelectFile}
                    hunks={hunks}
                    loadingFiles={isLoading}
                    loadingDiff={loadingDiff}
                    error={error ? String(error) : null}
                    sidebarTitle={`Archivos (${files.length})`}
                    emptyState="No hay diferencias entre estas ramas"
                />
            </div>
        </div>
    );
};
