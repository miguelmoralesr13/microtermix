import React from 'react';
import { ChevronDown, ChevronRight, FileCode } from 'lucide-react';

interface VitePreviewProps {
    isOpen: boolean;
    onToggle: () => void;
    remotes: Record<string, string>;
}

export const VitePreview: React.FC<VitePreviewProps> = ({ isOpen, onToggle, remotes }) => {
    return (
        <div className="shrink-0 border-b border-slate-800 bg-slate-900/80">
            <button
                type="button"
                onClick={onToggle}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
            >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <FileCode size={12} />
                <span>Vite wrapper (remotes para este proyecto)</span>
            </button>
            {isOpen && (
                <div className="px-3 pb-2 pt-0">
                    <pre className="text-[11px] font-mono text-slate-400 bg-slate-950 border border-slate-700 rounded-lg p-2 overflow-x-auto overflow-y-auto max-h-32">
                        {JSON.stringify(remotes, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
};
