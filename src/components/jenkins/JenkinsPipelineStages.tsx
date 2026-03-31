import React, { useState } from 'react';
import { formatDuration } from '../../services/jenkinsApi';
import { useJenkinsPipelineStages, useJenkinsStageNodes, useJenkinsStageLog } from '../../hooks/useJenkins';
import { STAGE_COLORS, JenkinsStageIcon } from './JenkinsCommon';
import { Terminal, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

function computeProgress(stages: any[], runStatus: string): number {
    if (!stages.length) return 0;
    if (runStatus === 'SUCCESS') return 100;
    if (runStatus === 'FAILED' || runStatus === 'ABORTED') {
        const failIdx = stages.findIndex(s => s.status === 'FAILED' || s.status === 'ABORTED');
        return failIdx >= 0 ? Math.round(((failIdx + 1) / stages.length) * 100) : 100;
    }
    const done = stages.filter(s => s.status === 'SUCCESS' || s.status === 'UNSTABLE').length;
    const inProgress = stages.findIndex(s => s.status === 'IN_PROGRESS');
    const partial = inProgress >= 0 ? 0.4 : 0;
    return Math.min(99, Math.round(((done + partial) / stages.length) * 100));
}

function StageDetailModal({
    jobPath,
    buildNumber,
    stage,
    onClose
}: {
    jobPath: string,
    buildNumber: number,
    stage: any,
    onClose: () => void
}) {
    const { data: nodesData, isLoading } = useJenkinsStageNodes(jobPath, buildNumber, stage.id, true);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const { data: log, isLoading: loadingLog } = useJenkinsStageLog(jobPath, buildNumber, selectedNodeId || '', !!selectedNodeId);

    // Defensive check: handle both array and object responses
    const nodes = Array.isArray(nodesData) ? nodesData : [];

    return (
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-[90vw] w-[90vw] sm:max-w-[90vw] h-[85vh] flex flex-col p-0 gap-0 bg-slate-900 border-slate-800">
                <DialogHeader className="px-5 py-4 border-b border-slate-800 bg-slate-900/50 space-y-0 shrink-0">
                    <div className="flex items-center gap-3">
                        <JenkinsStageIcon status={stage.status} size={18} />
                        <div className="flex flex-col gap-0.5">
                            <DialogTitle className="text-sm font-bold text-slate-100 flex items-center gap-2">
                                Stage: {stage.name}
                                <span className="text-[10px] font-mono text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">ID: {stage.id}</span>
                            </DialogTitle>
                            <p className="text-[10px] text-slate-500 font-mono">
                                Duration: {formatDuration(stage.durationMillis)} • Status: {stage.status}
                            </p>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 flex min-h-0 overflow-hidden">
                    {/* Left: Nodes List */}
                    <div className="w-1/3 border-r border-slate-800 overflow-y-auto bg-slate-950/30 p-2 space-y-1">
                        <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Execution Nodes</div>
                        {isLoading && <div className="p-4 text-center"><Loader2 size={16} className="animate-spin mx-auto text-slate-600" /></div>}
                        {nodes.map((node: any) => (
                            <button
                                key={node.id}
                                onClick={() => setSelectedNodeId(node.id)}
                                className={cn(
                                    "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all group",
                                    selectedNodeId === node.id
                                        ? "bg-sky-500/10 border border-sky-500/30 text-sky-400"
                                        : "hover:bg-slate-800/50 text-slate-400 border border-transparent"
                                )}
                            >
                                <JenkinsStageIcon status={node.status} size={12} />
                                <div className="flex-1 min-w-0">
                                    <div className="text-[11px] font-medium truncate">{node.name}</div>
                                    <div className="text-[9px] opacity-50 font-mono">{formatDuration(node.durationMillis)}</div>
                                </div>
                                <ChevronRight size={10} className={cn("transition-transform", selectedNodeId === node.id ? "rotate-90" : "opacity-0 group-hover:opacity-100")} />
                            </button>
                        ))}
                        {!isLoading && nodes.length === 0 && (
                            <div className="p-4 text-center text-[10px] text-slate-600">No nodes found for this stage.</div>
                        )}
                    </div>

                    {/* Right: Log View */}
                    <div className="flex-1 flex flex-col bg-[#020617] min-w-0">
                        {!selectedNodeId ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 p-8 text-center">
                                <Terminal size={32} className="mb-3 opacity-20" />
                                <p className="text-xs">Select a node on the left to view its specific execution log</p>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col overflow-hidden">
                                <div className="px-4 py-2 border-b border-white/5 bg-white/5 flex items-center justify-between">
                                    <span className="text-[10px] font-mono text-sky-400 flex items-center gap-2">
                                        <Terminal size={10} /> LOG FOR NODE {selectedNodeId}
                                    </span>
                                </div>
                                <div className="flex-1 overflow-auto p-4">
                                    {loadingLog ? (
                                        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono"><Loader2 size={12} className="animate-spin" /> Fetching stage logs...</div>
                                    ) : (
                                        <pre className="text-[11px] font-mono text-slate-300 leading-relaxed whitespace-pre-wrap selection:bg-sky-500/30">
                                            {log || 'No log output available for this node.'}
                                        </pre>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function JenkinsPipelineStages({
    jobPath,
    buildNumber,
    live,
}: {
    jobPath: string;
    buildNumber: number;
    live: boolean;
}) {
    const { data: run, isLoading } = useJenkinsPipelineStages(jobPath, buildNumber, live);
    const [selectedStage, setSelectedStage] = useState<any | null>(null);

    const supported = run !== null || isLoading;
    if (!supported || !run) return null;

    const stages = run.stages ?? [];
    const progress = computeProgress(stages, run.status);
    const progressColor = run.status === 'FAILED' ? '#ef4444'
        : run.status === 'SUCCESS' ? '#22c55e'
            : '#38bdf8';

    return (
        <>
            <div className="shrink-0 border-b border-slate-800 bg-slate-900/80 px-3 py-2.5 space-y-2">
                <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                                width: `${progress}%`,
                                backgroundColor: progressColor,
                                boxShadow: live ? `0 0 6px ${progressColor}88` : 'none',
                            }}
                        />
                    </div>
                    <span className="text-[10px] font-mono shrink-0" style={{ color: progressColor }}>
                        {progress}%
                    </span>
                    <span className="text-[10px] text-slate-500 shrink-0">
                        {formatDuration(run.durationMillis)}
                    </span>
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scroll-smooth">
                    {stages.map((stage: any, idx: number) => {
                        const color = STAGE_COLORS[stage.status as keyof typeof STAGE_COLORS] ?? '#475569';
                        const isLast = idx === stages.length - 1;
                        return (
                            <React.Fragment key={stage.id}>
                                <button
                                    onClick={() => setSelectedStage(stage)}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md shrink-0 border hover:brightness-125 transition-all active:scale-95"
                                    style={{ borderColor: color + '44', backgroundColor: color + '11' }}
                                >
                                    <JenkinsStageIcon status={stage.status} />
                                    <span className="text-[10px] font-medium whitespace-nowrap" style={{ color }}>
                                        {stage.name}
                                    </span>
                                    {stage.durationMillis > 0 && (
                                        <span className="text-[9px] text-slate-500 font-mono">
                                            {formatDuration(stage.durationMillis)}
                                        </span>
                                    )}
                                </button>
                                {!isLast && <div className="w-5 h-px bg-slate-700 shrink-0" />}
                            </React.Fragment>
                        );
                    })}
                    {stages.length === 0 && <span className="text-[10px] text-slate-600">No stages detected</span>}
                </div>
            </div>

            {selectedStage && (
                <StageDetailModal
                    jobPath={jobPath}
                    buildNumber={buildNumber}
                    stage={selectedStage}
                    onClose={() => setSelectedStage(null)}
                />
            )}
        </>
    );
}
