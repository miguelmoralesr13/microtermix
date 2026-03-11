import React, { useState, useEffect } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { loadConfig, getProjects, getIssueTypes, getUsers, createIssue } from '../jiraApi';

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

    const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon transition-colors";
    const labelCls = "block text-xs text-slate-400 mb-1";

    return (
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto py-6 px-4 space-y-4">
            <h2 className="text-base font-bold text-slate-200 flex items-center gap-2"><Plus size={16} /> Crear Issue</h2>

            {error && (
                <div className="p-3 bg-nexus-danger/10 border border-nexus-danger/30 rounded-lg text-nexus-danger text-xs">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelCls}>Proyecto</label>
                    <select value={projectKey} onChange={e => setProjectKey(e.target.value)} className={inputCls}>
                        {projects.length > 0
                            ? projects.map(p => <option key={p.key} value={p.key}>{p.key} — {p.name}</option>)
                            : <option value={projectKey}>{projectKey}</option>
                        }
                    </select>
                </div>
                <div>
                    <label className={labelCls}>Tipo</label>
                    <select value={issueType} onChange={e => setIssueType(e.target.value)} className={inputCls}>
                        {issueTypes.length > 0
                            ? issueTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)
                            : ['Story', 'Bug', 'Task'].map(t => <option key={t}>{t}</option>)
                        }
                    </select>
                </div>
            </div>

            <div>
                <label className={labelCls}>Resumen *</label>
                <input value={summary} onChange={e => setSummary(e.target.value)} required placeholder="Resumen del issue..." className={inputCls} />
            </div>

            <div>
                <label className={labelCls}>Descripción</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
                    placeholder="Descripción detallada..." className={`${inputCls} resize-none`} />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelCls}>Asignado a</label>
                    <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={inputCls}>
                        <option value="">— Sin asignar —</option>
                        {users.map(u => <option key={u.accountId} value={u.accountId}>{u.displayName}</option>)}
                        {users.length === 0 && assigneeId && <option value={assigneeId}>{assigneeId}</option>}
                    </select>
                </div>
                <div>
                    <label className={labelCls}>Prioridad</label>
                    <select value={priority} onChange={e => setPriority(e.target.value)} className={inputCls}>
                        {['Highest', 'High', 'Medium', 'Low', 'Lowest'].map(p => <option key={p}>{p}</option>)}
                    </select>
                </div>
            </div>

            <div>
                <label className={labelCls}>Labels (separados por coma)</label>
                <input value={labels} onChange={e => setLabels(e.target.value)} placeholder="frontend, bug" className={inputCls} />
            </div>

            {Object.keys(cfg.customFields).length > 0 && (
                <div className="p-3 bg-slate-800/40 rounded-lg text-xs text-slate-400">
                    <span className="font-bold">Campos personalizados que se enviarán: </span>
                    {Object.keys(cfg.customFields).join(', ')}
                </div>
            )}

            <button type="submit" disabled={submitting || !summary.trim()}
                className="w-full py-2.5 rounded-lg bg-nexus-accent hover:bg-opacity-80 text-white font-bold text-sm transition-colors disabled:opacity-50">
                {submitting ? <RefreshCw size={14} className="inline animate-spin mr-2" /> : null}
                {submitting ? 'Creando...' : 'Crear Issue'}
            </button>
        </form>
    );
}
