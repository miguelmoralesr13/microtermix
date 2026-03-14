import React, { useState, useEffect } from 'react';
import { Plus, RefreshCw, AlertCircle } from 'lucide-react';
import { loadConfig, getProjects, getIssueTypes, getUsers, createIssue } from '../jiraApi';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';

export function CreateIssueForm({ onCreated }: { onCreated: (key: string) => void }) {
    const cfg = loadConfig();
    const [summary, setSummary] = useState('');
    const [description, setDescription] = useState('');
    const [projectKey, setProjectKey] = useState(cfg.defaultProject);
    const [issueType, setIssueType] = useState(cfg.defaultIssueType);
    const [priority, setPriority] = useState(cfg.defaultPriority);
    const [assigneeId, setAssigneeId] = useState(cfg.defaultAssigneeId);
    const [labels, setLabels] = useState(cfg.defaultLabels.join(', '));
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [projects, setProjects] = useState<{ key: string; name: string }[]>([]);
    const [issueTypes, setIssueTypes] = useState<{ id: string; name: string }[]>([]);
    const [users, setUsers] = useState<{ accountId: string; displayName: string }[]>([]);

    useEffect(() => {
        getProjects().then(setProjects).catch(() => { });
    }, []);

    useEffect(() => {
        if (projectKey) {
            getIssueTypes(projectKey).then(setIssueTypes).catch(() => { });
            getUsers(projectKey).then(setUsers).catch(() => { });
        }
    }, [projectKey]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!summary.trim()) return;
        setSubmitting(true);
        setError(null);
        try {
            const fields: Record<string, any> = {
                project: { key: projectKey },
                issuetype: { name: issueType },
                summary: summary.trim(),
                priority: { name: priority },
                labels: labels.split(',').map(l => l.trim()).filter(Boolean),
                ...cfg.customFields,
            };
            if (description.trim()) {
                fields.description = {
                    type: 'doc', version: 1,
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: description.trim() }] }]
                };
            }
            if (assigneeId) fields.assignee = { id: assigneeId };
            const res = await createIssue(fields);
            setSummary(''); setDescription(''); setError(null);
            onCreated(res.key);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    const selectCls = "w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-microtermix-neon transition-colors";

    return (
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto py-8 px-6 space-y-6 bg-slate-900/30 rounded-xl border border-slate-800 shadow-sm mt-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                <div className="p-1.5 bg-microtermix-accent/10 rounded-lg">
                    <Plus size={18} className="text-microtermix-accent" />
                </div>
                <h2 className="text-lg font-bold text-slate-100">Crear Nueva Tarea</h2>
            </div>

            {error && (
                <div className="p-3 bg-microtermix-danger/10 border border-microtermix-danger/30 rounded-lg text-microtermix-danger text-xs flex items-start gap-2">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label htmlFor="project-select" className="text-slate-400">Proyecto</Label>
                    <select
                        id="project-select"
                        value={projectKey}
                        onChange={e => setProjectKey(e.target.value)}
                        className={selectCls}
                    >
                        {projects.length > 0
                            ? projects.map(p => <option key={p.key} value={p.key}>{p.key} — {p.name}</option>)
                            : <option value={projectKey}>{projectKey}</option>
                        }
                    </select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="type-select" className="text-slate-400">Tipo de Issue</Label>
                    <select
                        id="type-select"
                        value={issueType}
                        onChange={e => setIssueType(e.target.value)}
                        className={selectCls}
                    >
                        {issueTypes.length > 0
                            ? issueTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)
                            : ['Story', 'Bug', 'Task'].map(t => <option key={t}>{t}</option>)
                        }
                    </select>
                </div>
            </div>


            <div className="space-y-2">
                <Label className="text-slate-400">Resumen <span className="text-microtermix-danger">*</span></Label>
                <Input
                    value={summary}
                    onChange={e => setSummary(e.target.value)}
                    required
                    placeholder="Escribe un resumen descriptivo..."
                    className="bg-slate-950 border-slate-700 focus-visible:ring-1 focus-visible:ring-microtermix-neon h-10"
                />
            </div>

            <div className="space-y-2">
                <Label className="text-slate-400">Descripción</Label>
                <Textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={5}
                    placeholder="Proporciona detalles adicionales sobre la tarea..."
                    className="bg-slate-950 border-slate-700 focus-visible:ring-1 focus-visible:ring-microtermix-neon resize-none min-h-[120px]"
                />
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label className="text-slate-400">Asignado a</Label>
                    <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={selectCls}>
                        <option value="">— Sin asignar —</option>
                        {users.map(u => <option key={u.accountId} value={u.accountId}>{u.displayName}</option>)}
                        {users.length === 0 && assigneeId && <option value={assigneeId}>{assigneeId}</option>}
                    </select>
                </div>
                <div className="space-y-2">
                    <Label className="text-slate-400">Prioridad</Label>
                    <select value={priority} onChange={e => setPriority(e.target.value)} className={selectCls}>
                        {['Highest', 'High', 'Medium', 'Low', 'Lowest'].map(p => <option key={p}>{p}</option>)}
                    </select>
                </div>
            </div>

            <div className="space-y-2">
                <Label className="text-slate-400">Labels</Label>
                <Input
                    value={labels}
                    onChange={e => setLabels(e.target.value)}
                    placeholder="Ej: frontend, bug, ui (separados por coma)"
                    className="bg-slate-950 border-slate-700 focus-visible:ring-1 focus-visible:ring-microtermix-neon h-10 font-mono"
                />
            </div>

            {Object.keys(cfg.customFields).length > 0 && (
                <div className="p-3 bg-slate-800/40 rounded-lg text-[11px] text-slate-400 border border-slate-800 border-dashed">
                    <span className="font-bold text-slate-300">Campos personalizados: </span>
                    {Object.keys(cfg.customFields).join(', ')}
                </div>
            )}

            <Button
                type="submit"
                disabled={submitting || !summary.trim()}
                className="w-full bg-microtermix-accent hover:bg-microtermix-accent/80 text-white font-bold h-11 text-base shadow-lg shadow-microtermix-accent/10"
            >
                {submitting ? (
                    <>
                        <RefreshCw size={16} className="animate-spin mr-2" />
                        Creando...
                    </>
                ) : (
                    <>
                        <Plus size={16} className="mr-2" />
                        Crear Issue
                    </>
                )}
            </Button>
        </form>
    );
}
