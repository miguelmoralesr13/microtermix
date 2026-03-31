import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react';
import { JiraIssue, TempoWorklogEntry, getTempoWorklogs, logTempoWorklog } from './jiraApi';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';

interface TempoLogModalProps {
    issue: JiraIssue;
    authorAccountId: string;
    onClose: () => void;
    onSuccess: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
    return new Date().toISOString().slice(0, 10);
}

function defaultStartTime(): { h: number; m: number } {
    const now = new Date();
    return { h: now.getHours(), m: now.getMinutes() < 30 ? 0 : 30 };
}

function toTotalMinutes(h: number, m: number): number {
    return h * 60 + m;
}

function parseTimeToMinutes(t: string): number {
    const parts = t.split(':').map(Number);
    return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

function formatMinutes(total: number): string {
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
}

function formatHHMM(h: number, m: number): string {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function checkOverlap(
    logs: TempoWorklogEntry[],
    startH: number,
    startM: number,
    durationSeconds: number,
): boolean {
    const newStart = toTotalMinutes(startH, startM);
    const newEnd = newStart + Math.floor(durationSeconds / 60);
    return logs.some(log => {
        const logStart = parseTimeToMinutes(log.startTime);
        const logEnd = logStart + Math.floor(log.timeSpentSeconds / 60);
        return newStart < logEnd && newEnd > logStart;
    });
}

export const TempoLogModal: React.FC<TempoLogModalProps> = ({ issue, authorAccountId, onClose, onSuccess }) => {
    const def = defaultStartTime();
    const [date, setDate] = useState(todayStr());
    const [startH, setStartH] = useState(def.h);
    const [startM, setStartM] = useState(def.m);
    const [durH, setDurH] = useState(1);
    const [durM, setDurM] = useState(0);
    const [description, setDescription] = useState('');
    const [worklogs, setWorklogs] = useState<TempoWorklogEntry[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (successTimerRef.current) clearTimeout(successTimerRef.current); }, []);

    const durationSeconds = (durH * 60 + durM) * 60;
    const endTotalMin = toTotalMinutes(startH, startM) + durH * 60 + durM;
    const endH = Math.floor(endTotalMin / 60) % 24;
    const endM = endTotalMin % 60;
    const crossesMidnight = durationSeconds > 0 && endTotalMin >= 24 * 60;
    const hasOverlap = durationSeconds > 0 && checkOverlap(worklogs, startH, startM, durationSeconds);
    const totalDaySeconds = worklogs.reduce((acc, l) => acc + l.timeSpentSeconds, 0);
    const isValid = durationSeconds > 0 && !!authorAccountId;

    const fetchWorklogs = useCallback(async () => {
        if (!authorAccountId) return;
        setLoadingLogs(true);
        try {
            const data = await getTempoWorklogs(date, date, authorAccountId);
            setWorklogs(data);
        } catch {
            setWorklogs([]);
        } finally {
            setLoadingLogs(false);
        }
    }, [date, authorAccountId]);

    useEffect(() => { fetchWorklogs(); }, [fetchWorklogs]);

    const handleSubmit = async () => {
        if (!isValid || submitting) return;
        setSubmitting(true);
        setError(null);
        try {
            await logTempoWorklog(
                parseInt(issue.id, 10),
                authorAccountId,
                durationSeconds,
                date,
                `${formatHHMM(startH, startM)}:00`,
                description || undefined,
            );
            setSuccess(true);
            successTimerRef.current = setTimeout(() => { onSuccess(); onClose(); }, 1200);
        } catch (e: any) {
            setError(e?.message ?? 'Error al registrar tiempo.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="max-w-lg p-0 bg-slate-900 border-slate-700 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden gap-0">
                {/* Header */}
                <DialogHeader className="px-5 py-4 border-b border-slate-800 shrink-0">
                    <DialogTitle className="flex items-center gap-2 m-0 text-sm font-bold text-slate-200">
                        <Clock size={15} className="text-microtermix-accent" />
                        Log Time
                        <span className="font-mono text-xs text-microtermix-neon/70 ml-1 font-normal">{issue.key}</span>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-hide">
                    {/* Issue summary */}
                    <p className="text-xs text-slate-400 leading-snug truncate">{issue.fields.summary}</p>

                    {/* Date + Start + End row */}
                    <div className="grid grid-cols-4 gap-3">
                        <div className="col-span-2">
                            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Fecha</label>
                            <Input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="h-9 bg-slate-950 border-slate-700 text-xs focus-visible:ring-microtermix-accent"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Inicio</label>
                            <div className="flex gap-1">
                                <Select value={String(startH)} onValueChange={v => setStartH(Number(v))}>
                                    <SelectTrigger className="h-9 w-full bg-slate-950 border-slate-700 text-xs focus:ring-microtermix-accent font-mono px-2">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="min-w-[4rem]">
                                        {Array.from({ length: 24 }, (_, i) => (
                                            <SelectItem key={i} value={String(i)} className="font-mono text-xs">
                                                {String(i).padStart(2, '0')}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select value={String(startM)} onValueChange={v => setStartM(Number(v))}>
                                    <SelectTrigger className="h-9 w-full bg-slate-950 border-slate-700 text-xs focus:ring-microtermix-accent font-mono px-2">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="min-w-[4rem]">
                                        {[0, 15, 30, 45].map(m => (
                                            <SelectItem key={m} value={String(m)} className="font-mono text-xs">
                                                {String(m).padStart(2, '0')}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Fin</label>
                            <div className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-400 font-mono flex items-center gap-1">
                                {durationSeconds > 0 ? formatHHMM(endH, endM) : '--:--'}
                                {crossesMidnight && <span className="text-[9px] text-amber-400">+1d</span>}
                            </div>
                        </div>
                    </div>

                    {/* Duration row */}
                    <div>
                        <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Duración</label>
                        <div className="flex items-center gap-2">
                            <Select value={String(durH)} onValueChange={v => setDurH(Number(v))}>
                                <SelectTrigger className="w-24 h-9 bg-slate-950 border-slate-700 text-xs focus:ring-microtermix-accent">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Array.from({ length: 13 }, (_, i) => (
                                        <SelectItem key={i} value={String(i)} className="text-xs">{i}h</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={String(durM)} onValueChange={v => setDurM(Number(v))}>
                                <SelectTrigger className="w-24 h-9 bg-slate-950 border-slate-700 text-xs focus:ring-microtermix-accent">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {[0, 15, 30, 45].map(m => (
                                        <SelectItem key={m} value={String(m)} className="text-xs">{m}m</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {durationSeconds > 0 && (
                                <span className="text-xs font-bold text-microtermix-accent ml-2">
                                    = {formatMinutes(durH * 60 + durM)}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Descripción (opcional)</label>
                        <Textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Describe el trabajo realizado..."
                            rows={2}
                            className="w-full bg-slate-950 border-slate-700 text-xs focus-visible:ring-microtermix-accent resize-none placeholder:text-slate-600"
                        />
                    </div>

                    {/* Overlap warning */}
                    {hasOverlap && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                            <AlertTriangle size={13} className="text-amber-400 shrink-0" />
                            <p className="text-xs text-amber-300">Este horario se solapa con otro registro existente.</p>
                        </div>
                    )}

                    {/* Day preview */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider inline-flex gap-1.5 items-center">
                                MIS HORAS CARGADAS HOY {loadingLogs && <RefreshCw size={11} className="animate-spin" />}
                            </span>
                            <div className="text-xs font-bold text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                                Total: <span className="text-white">{formatMinutes(Math.floor(totalDaySeconds / 60))}</span>
                            </div>
                        </div>

                        <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-hide pr-1">
                            {worklogs.length === 0 && !loadingLogs && durationSeconds === 0 && (
                                <p className="text-xs text-slate-700 italic py-2 text-center">Sin registros este día.</p>
                            )}

                            {/* Compute timeline with gaps */}
                            {(() => {
                                // 1. Gather all blocks
                                type TimeBlock = {
                                    id: string;
                                    startMin: number;
                                    endMin: number;
                                    isNew: boolean;
                                    log?: TempoWorklogEntry;
                                };
                                const blocks: TimeBlock[] = worklogs.map(log => {
                                    const startMin = parseTimeToMinutes(log.startTime);
                                    return {
                                        id: log.tempoWorklogId.toString(),
                                        startMin,
                                        endMin: startMin + Math.floor(log.timeSpentSeconds / 60),
                                        isNew: false,
                                        log
                                    };
                                });

                                // 2. Add new entry if duration > 0
                                if (durationSeconds > 0) {
                                    const newStart = toTotalMinutes(startH, startM);
                                    blocks.push({
                                        id: 'new-entry',
                                        startMin: newStart,
                                        endMin: newStart + Math.floor(durationSeconds / 60),
                                        isNew: true
                                    });
                                }

                                // 3. Sort by start time
                                blocks.sort((a, b) => a.startMin - b.startMin);

                                // 4. Insert gaps
                                const timeline: (TimeBlock | { isGap: true; startMin: number; endMin: number; durationMin: number })[] = [];
                                let currentMin = blocks.length > 0 ? Math.min(blocks[0].startMin, 9 * 60) : 9 * 60; // Start at 09:00 or earliest log

                                for (const block of blocks) {
                                    if (block.startMin > currentMin) {
                                        // Gap!
                                        timeline.push({
                                            isGap: true,
                                            startMin: currentMin,
                                            endMin: block.startMin,
                                            durationMin: block.startMin - currentMin
                                        });
                                    }
                                    timeline.push(block);
                                    currentMin = Math.max(currentMin, block.endMin);
                                }

                                return timeline.map((item, idx) => {
                                    if ('isGap' in item) {
                                        const startH = Math.floor(item.startMin / 60) % 24;
                                        const startM = item.startMin % 60;
                                        const endH = Math.floor(item.endMin / 60) % 24;
                                        const endM = item.endMin % 60;
                                        return (
                                            <div
                                                key={`gap-${item.startMin}-${idx}`}
                                                className="flex items-center gap-2 px-2 py-0.5 text-xs border-l-2 border-dashed border-slate-700/50 ml-1 pl-3 opacity-60 cursor-pointer hover:opacity-100 hover:bg-slate-800/60 transition-colors rounded-r group"
                                                onClick={() => {
                                                    setStartH(startH);
                                                    setStartM(startM);
                                                    setDurH(Math.floor(item.durationMin / 60));
                                                    setDurM(item.durationMin % 60);
                                                }}
                                                title="Click para rellenar este espacio"
                                            >
                                                <span className="font-mono text-slate-600 shrink-0 w-20 text-[10px] group-hover:text-microtermix-accent transition-colors">
                                                    {formatHHMM(startH, startM)} – {formatHHMM(endH, endM)}
                                                </span>
                                                <span className="text-slate-600 italic flex-1 text-[10px] group-hover:text-slate-300 transition-colors">
                                                    Espacio libre (click para llenar)
                                                </span>
                                                <span className="text-slate-600 shrink-0 text-[10px] pr-1 group-hover:text-slate-300 transition-colors">
                                                    {formatMinutes(item.durationMin)}
                                                </span>
                                            </div>
                                        );
                                    }

                                    const startH = Math.floor(item.startMin / 60) % 24;
                                    const startM = item.startMin % 60;
                                    const endH = Math.floor(item.endMin / 60) % 24;
                                    const endM = item.endMin % 60;

                                    if (item.isNew) {
                                        return (
                                            <div key="new-entry" className={`flex relative items-center gap-2 px-2 py-2 rounded text-xs border shadow-lg z-10 ${hasOverlap ? 'bg-amber-500/10 border-amber-500/50 shadow-amber-500/10' : 'bg-microtermix-neon/10 border-microtermix-neon/50 shadow-microtermix-neon/10'}`}>
                                                <div className={`absolute -left-1.5 w-1 h-full rounded-full bg-current opacity-70 ${hasOverlap ? 'text-amber-500' : 'text-microtermix-neon'}`} />
                                                <span className={`font-mono shrink-0 w-20 ${hasOverlap ? 'text-amber-400' : 'text-microtermix-neon font-bold'}`}>
                                                    {formatHHMM(startH, startM)} – {formatHHMM(endH, endM)}
                                                </span>
                                                <span className="font-mono text-[10px] shrink-0 text-microtermix-accent bg-microtermix-accent/10 px-1 py-0.5 rounded">{issue.key}</span>
                                                <span className={`truncate flex-1 ${hasOverlap ? 'text-amber-300' : 'text-microtermix-neon/90 font-medium'}`}>
                                                    {description || '(nuevo registro)'}
                                                </span>
                                                <span className={`shrink-0 font-bold ${hasOverlap ? 'text-amber-400' : 'text-microtermix-neon'}`}>
                                                    {formatMinutes(Math.floor(durationSeconds / 60))}
                                                </span>
                                            </div>
                                        );
                                    }

                                    const log = item.log!;
                                    return (
                                        <div key={item.id} className="flex relative items-center gap-2 px-2 py-1.5 bg-slate-800/40 hover:bg-slate-800/80 transition-colors rounded text-xs border border-transparent hover:border-slate-700/50">
                                            <div className="absolute -left-1 w-0.5 h-full rounded-full bg-slate-700" />
                                            <span className="font-mono text-slate-400 shrink-0 w-20">
                                                {formatHHMM(startH, startM)} – {formatHHMM(endH, endM)}
                                            </span>
                                            <span className="text-microtermix-accent/70 font-mono text-[10px] shrink-0 bg-slate-900 px-1 py-0.5 rounded">
                                                {log.issue.key ?? `#${log.issue.id}`}
                                            </span>
                                            <span className="text-slate-400 truncate flex-1" title={log.description}>
                                                {log.description || '—'}
                                            </span>
                                            <span className="text-slate-500 shrink-0 font-medium">
                                                {formatMinutes(Math.floor(log.timeSpentSeconds / 60))}
                                            </span>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-slate-800 shrink-0 flex items-center justify-between gap-3 bg-slate-900/50">
                    {!authorAccountId && (
                        <p className="text-xs text-amber-400 flex-1">Configura tu Account ID en Ajustes de Jira primero.</p>
                    )}
                    {error && (
                        <p className="text-xs text-microtermix-danger flex-1 truncate">{error}</p>
                    )}
                    {success && (
                        <p className="text-xs text-microtermix-success flex items-center gap-1 flex-1 font-bold">
                            <CheckCircle size={14} /> ¡Tiempo registrado!
                        </p>
                    )}
                    {!error && !success && !authorAccountId && <div className="flex-1" />}
                    {!error && !success && authorAccountId && (
                        <div className="flex-1 text-[10px] text-slate-500">
                            Total esperado al guardar: <span className="font-bold text-slate-300">{formatMinutes(Math.floor((totalDaySeconds + durationSeconds) / 60))}</span>
                        </div>
                    )}

                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="text-xs text-slate-400 hover:text-red-400"
                    >
                        Cancelar
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => { onSuccess(); onClose(); }}
                        className="text-xs text-slate-400 hover:text-slate-200 border-slate-700 hover:bg-slate-800"
                    >
                        Omitir horas
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!isValid || submitting || success}
                        className="text-xs font-bold bg-microtermix-accent hover:bg-microtermix-accent/80 text-white gap-1.5 min-w-[120px]"
                    >
                        {submitting && <RefreshCw size={12} className="animate-spin" />}
                        {submitting ? 'Registrando...' : 'Registrar tiempo'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
