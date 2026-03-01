import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Clock, AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react';
import { JiraIssue, TempoWorklogEntry, getTempoWorklogs, logTempoWorklog } from './jiraApi';

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
            const data = await getTempoWorklogs(date, date, authorAccountId, parseInt(issue.id, 10));
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Registrar tiempo"
                className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-2">
                        <Clock size={15} className="text-nexus-accent" />
                        <span className="text-sm font-bold text-slate-200">Log Time</span>
                        <span className="font-mono text-xs text-nexus-neon/70 ml-1">{issue.key}</span>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" className="p-1 text-slate-500 hover:text-white rounded transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-hide">
                    {/* Issue summary */}
                    <p className="text-xs text-slate-400 leading-snug truncate">{issue.fields.summary}</p>

                    {/* Date + Start + End row */}
                    <div className="grid grid-cols-4 gap-3">
                        <div className="col-span-2">
                            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Fecha</label>
                            <input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-accent transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Inicio</label>
                            <div className="flex gap-1">
                                <select
                                    value={startH}
                                    onChange={e => setStartH(Number(e.target.value))}
                                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-accent"
                                >
                                    {Array.from({ length: 24 }, (_, i) => (
                                        <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                                    ))}
                                </select>
                                <select
                                    value={startM}
                                    onChange={e => setStartM(Number(e.target.value))}
                                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-accent"
                                >
                                    {[0, 15, 30, 45].map(m => (
                                        <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                                    ))}
                                </select>
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
                            <select
                                value={durH}
                                onChange={e => setDurH(Number(e.target.value))}
                                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-accent"
                            >
                                {Array.from({ length: 9 }, (_, i) => (
                                    <option key={i} value={i}>{i}h</option>
                                ))}
                            </select>
                            <select
                                value={durM}
                                onChange={e => setDurM(Number(e.target.value))}
                                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-accent"
                            >
                                {[0, 15, 30, 45].map(m => (
                                    <option key={m} value={m}>{m}m</option>
                                ))}
                            </select>
                            {durationSeconds > 0 && (
                                <span className="text-xs text-slate-400">= {formatMinutes(durH * 60 + durM)}</span>
                            )}
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Descripción (opcional)</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Describe el trabajo realizado..."
                            rows={2}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-nexus-accent transition-colors resize-none scrollbar-hide"
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
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Preview — {date}
                            </span>
                            {loadingLogs && <RefreshCw size={11} className="animate-spin text-slate-600" />}
                            <span className="text-[10px] text-slate-600">
                                Registrado: {formatMinutes(Math.floor(totalDaySeconds / 60))}
                                {durationSeconds > 0 && ` → con este: ${formatMinutes(Math.floor((totalDaySeconds + durationSeconds) / 60))}`}
                            </span>
                        </div>

                        <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-hide">
                            {worklogs.length === 0 && !loadingLogs && (
                                <p className="text-xs text-slate-700 italic py-2 text-center">Sin registros este día.</p>
                            )}
                            {[...worklogs]
                                .sort((a, b) => a.startTime.localeCompare(b.startTime))
                                .map(log => {
                                    const logStartMin = parseTimeToMinutes(log.startTime);
                                    const logEndMin = logStartMin + Math.floor(log.timeSpentSeconds / 60);
                                    const logEndH = Math.floor(logEndMin / 60) % 24;
                                    const logEndM = logEndMin % 60;
                                    return (
                                        <div
                                            key={log.tempoWorklogId}
                                            className="flex items-center gap-2 px-2 py-1.5 bg-slate-800/50 rounded text-xs"
                                        >
                                            <span className="font-mono text-slate-500 shrink-0 w-20">
                                                {log.startTime.slice(0, 5)} – {formatHHMM(logEndH, logEndM)}
                                            </span>
                                            <span className="text-nexus-accent/80 font-mono text-[10px] shrink-0">
                                                {log.issue.key ?? `#${log.issue.id}`}
                                            </span>
                                            <span className="text-slate-400 truncate flex-1">
                                                {log.description || '—'}
                                            </span>
                                            <span className="text-slate-600 shrink-0">
                                                {formatMinutes(Math.floor(log.timeSpentSeconds / 60))}
                                            </span>
                                        </div>
                                    );
                                })}
                            {/* New entry preview */}
                            {durationSeconds > 0 && (
                                <div className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs border ${hasOverlap ? 'bg-amber-500/10 border-amber-500/30' : 'bg-nexus-neon/10 border-nexus-neon/30'}`}>
                                    <span className={`font-mono shrink-0 w-20 ${hasOverlap ? 'text-amber-400' : 'text-nexus-neon'}`}>
                                        {formatHHMM(startH, startM)} – {formatHHMM(endH, endM)}
                                    </span>
                                    <span className="font-mono text-[10px] shrink-0 text-nexus-accent">{issue.key}</span>
                                    <span className={`truncate flex-1 ${hasOverlap ? 'text-amber-300' : 'text-nexus-neon/80'}`}>
                                        {description || '(nuevo)'}
                                    </span>
                                    <span className={`shrink-0 ${hasOverlap ? 'text-amber-400' : 'text-nexus-neon'}`}>
                                        {formatMinutes(durH * 60 + durM)}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-slate-800 shrink-0 flex items-center justify-between gap-3">
                    {!authorAccountId && (
                        <p className="text-xs text-amber-400 flex-1">Configura tu Account ID en Ajustes de Jira primero.</p>
                    )}
                    {error && (
                        <p className="text-xs text-nexus-danger flex-1 truncate">{error}</p>
                    )}
                    {success && (
                        <p className="text-xs text-nexus-success flex items-center gap-1 flex-1">
                            <CheckCircle size={12} /> Tiempo registrado correctamente
                        </p>
                    )}
                    {!error && !success && <div className="flex-1" />}
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!isValid || submitting || success}
                        className="px-4 py-2 text-xs font-bold bg-nexus-accent hover:bg-opacity-80 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-1.5"
                    >
                        {submitting && <RefreshCw size={11} className="animate-spin" />}
                        {submitting ? 'Registrando...' : 'Registrar tiempo'}
                    </button>
                </div>
            </div>
        </div>
    );
};
