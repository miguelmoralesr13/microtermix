import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal, Search, X, CheckCircle2, Copy, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { jenkinsGetProgressiveLog } from '../../services/jenkinsApi';
import { useJenkinsStore } from '../../stores/jenkinsStore';
import { JenkinsPipelineStages } from './JenkinsPipelineStages';
import 'xterm/css/xterm.css';

export interface LogTarget {
    jobName: string;
    branchName?: string;
    buildNumber: number;
    jobPath: string;
    building: boolean;
}

export function JenkinsLogViewer({
    target,
    onClose,
}: {
    target: LogTarget;
    onClose: () => void;
}) {
    const activeAccountId = useJenkinsStore(s => s.activeAccountId);
    const cfg = useJenkinsStore(s => s.accounts.find(a => a.id === activeAccountId));
    
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const searchAddonRef = useRef<SearchAddon | null>(null);
    
    const [loading, setLoading] = useState(true);
    const [live, setLive] = useState(target.building);
    const [copied, setCopied] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    
    const offsetRef = useRef(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Initialize XTerm
    useEffect(() => {
        if (!terminalRef.current) return;

        const term = new XTerm({
            theme: {
                background: '#020617',
                foreground: '#cbd5e1',
                cursor: '#38bdf8',
                black: '#020617',
                red: '#f87171',
                green: '#4ade80',
                yellow: '#fbbf24',
                blue: '#60a5fa',
                magenta: '#c084fc',
                cyan: '#22d3ee',
                white: '#f8fafc',
            },
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: 12,
            scrollback: 10000,
            convertEol: true,
            readonly: true,
        });

        const fitAddon = new FitAddon();
        const searchAddon = new SearchAddon();
        
        term.loadAddon(fitAddon);
        term.loadAddon(searchAddon);
        
        term.open(terminalRef.current);
        fitAddon.fit();
        
        xtermRef.current = term;
        fitAddonRef.current = fitAddon;
        searchAddonRef.current = searchAddon;

        const resizeObserver = new ResizeObserver(() => {
            if (terminalRef.current && terminalRef.current.offsetWidth > 0) {
                try { fitAddon.fit(); } catch (_) { }
            }
        });
        resizeObserver.observe(terminalRef.current);

        return () => {
            resizeObserver.disconnect();
            term.dispose();
        };
    }, []);

    const fetchChunk = useCallback(async () => {
        if (!cfg) return;
        try {
            const chunk = await jenkinsGetProgressiveLog(
                cfg,
                target.jobPath,
                target.buildNumber,
                offsetRef.current,
            );
            
            if (chunk.text && xtermRef.current) {
                xtermRef.current.write(chunk.text);
                offsetRef.current = chunk.textSize;
            }
            
            if (!chunk.moreData) {
                setLive(false);
                if (intervalRef.current) clearInterval(intervalRef.current);
            }
            setLoading(false);
        } catch {
            setLoading(false);
        }
    }, [cfg, target]);

    useEffect(() => {
        offsetRef.current = 0;
        if (xtermRef.current) xtermRef.current.reset();
        setLoading(true);
        setLive(target.building);
        fetchChunk();
    }, [target.jobPath, target.buildNumber, fetchChunk]);

    useEffect(() => {
        if (!live) return;
        intervalRef.current = setInterval(fetchChunk, 4000);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [live, fetchChunk]);

    const handleCopy = () => {
        if (!xtermRef.current) return;
        xtermRef.current.selectAll();
        const selection = xtermRef.current.getSelection();
        navigator.clipboard.writeText(selection);
        xtermRef.current.clearSelection();
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="flex flex-col h-full bg-slate-950">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 shrink-0">
                <Terminal size={13} className="text-nexus-neon shrink-0" />
                <span className="text-xs text-slate-300 font-mono truncate flex-1">
                    {target.jobName}{target.branchName ? ` / ${target.branchName}` : ''} #{target.buildNumber}
                </span>
                
                {searchOpen && (
                    <div className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                        <input
                            className="bg-transparent border-none outline-none text-[10px] text-slate-200 w-32"
                            placeholder="Find..."
                            value={searchQuery}
                            autoFocus
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') searchAddonRef.current?.findNext(searchQuery);
                                if (e.key === 'Escape') setSearchOpen(false);
                            }}
                        />
                        <button onClick={() => searchAddonRef.current?.findPrevious(searchQuery)} className="text-slate-500 hover:text-slate-300"><ChevronUp size={10}/></button>
                        <button onClick={() => searchAddonRef.current?.findNext(searchQuery)} className="text-slate-500 hover:text-slate-300"><ChevronDown size={10}/></button>
                        <button onClick={() => setSearchOpen(false)} className="text-slate-500 hover:text-red-400"><X size={10}/></button>
                    </div>
                )}

                {!searchOpen && (
                    <button
                        onClick={() => setSearchOpen(true)}
                        className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
                        title="Search"
                    >
                        <Search size={13} />
                    </button>
                )}

                {live && (
                    <span className="flex items-center gap-1 text-[10px] text-nexus-neon font-mono mx-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-nexus-neon animate-pulse" />
                        LIVE
                    </span>
                )}
                
                <button
                    onClick={handleCopy}
                    title="Copy log"
                    className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
                >
                    {copied ? <CheckCircle2 size={13} className="text-emerald-400" /> : <Copy size={13} />}
                </button>
                <button
                    onClick={onClose}
                    className="p-1 rounded text-slate-500 hover:text-red-400 transition-colors"
                >
                    <X size={13} />
                </button>
            </div>

            <JenkinsPipelineStages
                jobPath={target.jobPath}
                buildNumber={target.buildNumber}
                live={live}
            />

            <div className="flex-1 min-h-0 bg-[#020617] relative">
                {loading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#020617]/50 text-slate-500 text-xs gap-2">
                        <Loader2 size={12} className="animate-spin" /> Loading console log…
                    </div>
                )}
                <div ref={terminalRef} className="w-full h-full p-2" />
            </div>
        </div>
    );
}
