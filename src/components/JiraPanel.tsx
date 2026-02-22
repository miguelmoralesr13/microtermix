import React, { useState, useEffect, useCallback } from 'react';
import {
    Settings, Plus, RefreshCw, Search, X, CheckCircle,
    AlertCircle, Layers, ExternalLink
} from 'lucide-react';
import {
    JiraConfig, JiraIssue, loadConfig, saveConfig, testConnection,
    getMyIssues, getProjectIssues, statusColor,
    getProjects, getIssueTypes, getUsers, createIssue
} from './jiraApi';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'board' | 'create' | 'settings';
type BoardFilter = 'mine' | 'project' | 'search';

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: JiraIssue['fields']['status'] }) {
    const color = statusColor(status.statusCategory.colorName);
    return (
        <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
            style={{ backgroundColor: color + '22', color, border: `1px solid ${color}44` }}
        >
            {status.name}
        </span>
    );
}

// ── Issue Card ────────────────────────────────────────────────────────────────

function IssueCard({ issue, onClick }: { issue: JiraIssue; onClick: () => void }) {
    const { fields } = issue;
    const cfg = loadConfig();
    return (
        <div
            onClick={onClick}
            className="flex items-start gap-3 px-4 py-3 bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800 hover:border-slate-600 rounded-lg cursor-pointer transition-colors group"
        >
            {fields.issuetype?.iconUrl && (
                <img src={fields.issuetype.iconUrl} alt={fields.issuetype.name} className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <a
                        href={`${cfg.baseUrl}/browse/${issue.key}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="font-mono text-[11px] text-nexus-neon/70 hover:text-nexus-neon flex items-center gap-0.5"
                    >
                        {issue.key}<ExternalLink size={9} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                    <StatusBadge status={fields.status} />
                    {fields.priority?.iconUrl && (
                        <img src={fields.priority.iconUrl} alt={fields.priority.name} title={fields.priority.name} className="w-3.5 h-3.5" />
                    )}
                </div>
                <p className="text-sm text-slate-200 leading-snug truncate">{fields.summary}</p>
                {fields.labels.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                        {fields.labels.slice(0, 3).map(l => (
                            <span key={l} className="px-1.5 py-px text-[9px] rounded bg-slate-700 text-slate-400 font-mono">{l}</span>
                        ))}
                    </div>
                )}
            </div>
            {fields.assignee && (
                <img
                    src={fields.assignee.avatarUrls['24x24']}
                    alt={fields.assignee.displayName}
                    title={fields.assignee.displayName}
                    className="w-6 h-6 rounded-full shrink-0"
                />
            )}
        </div>
    );
}

// ── Issue Detail Modal ────────────────────────────────────────────────────────

function IssueDetailModal({ issue, onClose }: { issue: JiraIssue; onClose: () => void }) {
    const cfg = loadConfig();
    const { fields } = issue;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start gap-3 p-5 border-b border-slate-800">
                    {fields.issuetype?.iconUrl && <img src={fields.issuetype.iconUrl} alt="" className="w-5 h-5 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                        <a href={`${cfg.baseUrl}/browse/${issue.key}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-mono text-nexus-neon hover:underline flex items-center gap-1">
                            {issue.key} <ExternalLink size={11} />
                        </a>
                        <h2 className="text-base font-bold text-white mt-0.5">{fields.summary}</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white p-1 rounded hover:bg-slate-700">
                        <X size={18} />
                    </button>
                </div>
                <div className="p-5 space-y-4">
                    <div className="flex flex-wrap gap-3 text-xs">
                        <div className="flex items-center gap-1.5">
                            <span className="text-slate-500">Status:</span>
                            <StatusBadge status={fields.status} />
                        </div>
                        {fields.priority && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-slate-500">Priority:</span>
                                <span className="text-slate-300 flex items-center gap-1">
                                    {fields.priority.iconUrl && <img src={fields.priority.iconUrl} alt="" className="w-3.5 h-3.5" />}
                                    {fields.priority.name}
                                </span>
                            </div>
                        )}
                        {fields.assignee && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-slate-500">Assignee:</span>
                                <span className="text-slate-300 flex items-center gap-1">
                                    <img src={fields.assignee.avatarUrls['16x16']} alt="" className="w-4 h-4 rounded-full" />
                                    {fields.assignee.displayName}
                                </span>
                            </div>
                        )}
                    </div>
                    {fields.labels.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap">
                            {fields.labels.map(l => (
                                <span key={l} className="px-2 py-0.5 text-[10px] rounded bg-slate-700 text-slate-300 font-mono">{l}</span>
                            ))}
                        </div>
                    )}
                    {fields.description && (
                        <div className="text-sm text-slate-300 bg-slate-800/40 rounded-lg p-3 whitespace-pre-wrap leading-relaxed">
                            {typeof fields.description === 'string'
                                ? fields.description
                                : fields.description?.content?.[0]?.content?.[0]?.text ?? '(sin descripción)'
                            }
                        </div>
                    )}
                    <p className="text-[10px] text-slate-600">Creado: {new Date(fields.created).toLocaleString()} · Actualizado: {new Date(fields.updated).toLocaleString()}</p>
                </div>
            </div>
        </div>
    );
}

// ── Settings Panel ────────────────────────────────────────────────────────────

function SettingsPanel({ onSaved }: { onSaved: () => void }) {
    const [cfg, setCfg] = useState<JiraConfig>(loadConfig());
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
    const [saving, setSaving] = useState(false);
    // For custom fields editor
    const [newFieldKey, setNewFieldKey] = useState('');
    const [newFieldVal, setNewFieldVal] = useState('');

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const me = await testConnection();
            setTestResult({ ok: true, msg: `✅ Conectado como ${me.displayName}` });
            if (!cfg.defaultAssigneeId) {
                setCfg(c => ({ ...c, defaultAssigneeId: me.accountId }));
            }
        } catch (e: any) {
            setTestResult({ ok: false, msg: `❌ ${e.message}` });
        } finally {
            setTesting(false);
        }
    };

    const handleSave = () => {
        setSaving(true);
        saveConfig(cfg);
        setTimeout(() => { setSaving(false); onSaved(); }, 400);
    };

    const addCustomField = () => {
        if (!newFieldKey.trim()) return;
        setCfg(c => ({ ...c, customFields: { ...c.customFields, [newFieldKey.trim()]: newFieldVal } }));
        setNewFieldKey(''); setNewFieldVal('');
    };

    const removeCustomField = (key: string) => {
        setCfg(c => {
            const cf = { ...c.customFields };
            delete cf[key];
            return { ...c, customFields: cf };
        });
    };

    const field = (label: string, key: keyof JiraConfig, type: 'text' | 'password' = 'text') => (
        <div>
            <label className="block text-xs text-slate-400 mb-1">{label}</label>
            <input
                type={type}
                value={(cfg[key] as string) ?? ''}
                onChange={e => setCfg(c => ({ ...c, [key]: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon transition-colors"
            />
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto space-y-6 py-6 px-4">
            <h2 className="text-base font-bold text-slate-200 flex items-center gap-2"><Settings size={16} /> Configuración de Jira</h2>

            {/* Connection */}
            <section className="space-y-3 bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Conexión</h3>
                {field('Jira Base URL (ej. https://empresa.atlassian.net)', 'baseUrl')}
                {field('Email de Atlassian', 'email')}
                {field('API Token', 'apiToken', 'password')}
                <button onClick={handleTest} disabled={testing}
                    className="px-4 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50">
                    {testing ? <RefreshCw size={12} className="inline animate-spin mr-1" /> : null}
                    {testing ? 'Probando...' : 'Probar conexión'}
                </button>
                {testResult && (
                    <p className={`text-xs ${testResult.ok ? 'text-nexus-success' : 'text-nexus-danger'}`}>{testResult.msg}</p>
                )}
            </section>

            {/* Default fields */}
            <section className="space-y-3 bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Valores por defecto (para crear issues)</h3>
                {field('Clave de proyecto por defecto (ej. NCPPPMC)', 'defaultProject')}
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Tipo de issue por defecto</label>
                    <select value={cfg.defaultIssueType}
                        onChange={e => setCfg(c => ({ ...c, defaultIssueType: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon">
                        {['Story', 'Bug', 'Task', 'Sub-task', 'Epic'].map(t => <option key={t}>{t}</option>)}
                    </select>
                </div>
                {field('Account ID del asignado por defecto', 'defaultAssigneeId')}
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Prioridad por defecto</label>
                    <select value={cfg.defaultPriority}
                        onChange={e => setCfg(c => ({ ...c, defaultPriority: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon">
                        {['Highest', 'High', 'Medium', 'Low', 'Lowest'].map(p => <option key={p}>{p}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Labels por defecto (separados por coma)</label>
                    <input
                        type="text"
                        value={cfg.defaultLabels.join(', ')}
                        onChange={e => setCfg(c => ({ ...c, defaultLabels: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                        placeholder="frontend, microfrontend"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon"
                    />
                </div>
            </section>

            {/* Custom fields */}
            <section className="space-y-3 bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Campos personalizados (custom fields Jira)</h3>
                <p className="text-[11px] text-slate-500">Agrega campos como <code className="bg-slate-800 px-1 rounded">customfield_10020</code> con su valor por defecto. Se enviarán automáticamente al crear un issue.</p>
                {Object.entries(cfg.customFields).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-nexus-neon/80 bg-slate-800 px-2 py-1 rounded flex-1">{k}</span>
                        <span className="text-slate-300 flex-1 truncate">{JSON.stringify(v)}</span>
                        <button onClick={() => removeCustomField(k)} className="text-nexus-danger hover:bg-slate-700 p-1 rounded"><X size={12} /></button>
                    </div>
                ))}
                <div className="flex gap-2">
                    <input value={newFieldKey} onChange={e => setNewFieldKey(e.target.value)}
                        placeholder="customfield_XXXXX"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-nexus-neon font-mono" />
                    <input value={newFieldVal} onChange={e => setNewFieldVal(e.target.value)}
                        placeholder="valor"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-nexus-neon" />
                    <button onClick={addCustomField} className="px-3 py-1 text-xs bg-nexus-neon text-nexus-darker rounded font-bold hover:bg-opacity-80 transition-colors">+</button>
                </div>
            </section>

            <button onClick={handleSave} disabled={saving}
                className="w-full py-2.5 rounded-lg bg-nexus-accent hover:bg-opacity-80 text-white font-bold text-sm transition-colors disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar configuración'}
            </button>
        </div>
    );
}

// ── Create Issue Form ─────────────────────────────────────────────────────────

function CreateIssueForm({ onCreated }: { onCreated: (key: string) => void }) {
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

// ── Board View ─────────────────────────────────────────────────────────────────

function BoardView() {
    const cfg = loadConfig();
    const [issues, setIssues] = useState<JiraIssue[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<BoardFilter>('mine');
    const [selected, setSelected] = useState<JiraIssue | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            let data: JiraIssue[];
            if (filter === 'mine') data = await getMyIssues();
            else data = await getProjectIssues(cfg.defaultProject || 'defaultProject');
            setIssues(data);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [filter, cfg.defaultProject]);

    useEffect(() => { load(); }, [load]);

    const filtered = issues.filter(i =>
        !search || i.key.toLowerCase().includes(search.toLowerCase()) ||
        i.fields.summary.toLowerCase().includes(search.toLowerCase())
    );

    const filterBtns: { id: BoardFilter; label: string }[] = [
        { id: 'mine', label: 'Mis Issues' },
        { id: 'project', label: `Proyecto (${cfg.defaultProject || '—'})` },
    ];

    if (!cfg.baseUrl) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-500 p-12">
                <AlertCircle size={40} />
                <p className="text-sm text-center">Jira no está configurado.<br />Ve a <strong className="text-slate-300">Settings</strong> para agregar tus credenciales.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/50 shrink-0 flex-wrap">
                <div className="relative flex-1 min-w-40">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar issues..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 pl-7 pr-7 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-nexus-neon"
                    />
                    {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"><X size={11} /></button>}
                </div>
                {filterBtns.map(f => (
                    <button key={f.id} onClick={() => setFilter(f.id)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${filter === f.id ? 'bg-nexus-neon text-nexus-darker border-transparent' : 'text-slate-400 border-slate-700 hover:border-slate-500'}`}>
                        {f.label}
                    </button>
                ))}
                <button onClick={load} disabled={loading} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors">
                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                </button>
                <span className="text-[10px] text-slate-600">{filtered.length} issues</span>
            </div>

            {/* Issues */}
            <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-2">
                {error && (
                    <div className="p-3 bg-nexus-danger/10 border border-nexus-danger/30 rounded-lg text-nexus-danger text-xs flex items-start gap-2">
                        <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
                    </div>
                )}
                {loading && !issues.length ? (
                    <div className="flex items-center justify-center py-16 text-slate-500 gap-2">
                        <RefreshCw size={16} className="animate-spin" /> Cargando issues...
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center text-slate-600 py-16 text-sm">No se encontraron issues.</div>
                ) : (
                    filtered.map(issue => (
                        <IssueCard key={issue.id} issue={issue} onClick={() => setSelected(issue)} />
                    ))
                )}
            </div>

            {selected && <IssueDetailModal issue={selected} onClose={() => setSelected(null)} />}
        </div>
    );
}

// ── Main JiraPanel ─────────────────────────────────────────────────────────────

export const JiraPanel: React.FC = () => {
    const [tab, setTab] = useState<Tab>('board');
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: 'board', label: 'Board', icon: <Layers size={14} /> },
        { id: 'create', label: 'Crear Issue', icon: <Plus size={14} /> },
        { id: 'settings', label: 'Configuración', icon: <Settings size={14} /> },
    ];

    return (
        <div className="flex flex-col h-full min-h-0 bg-slate-950">
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-800 shrink-0 bg-slate-900/50">
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${tab === t.id
                            ? 'border-nexus-neon text-white'
                            : 'border-transparent text-slate-500 hover:text-slate-300'
                            }`}>
                        {t.icon}{t.label}
                    </button>
                ))}
                {successMsg && (
                    <div className="ml-auto flex items-center gap-1.5 text-xs text-nexus-success">
                        <CheckCircle size={13} /> {successMsg}
                        <button onClick={() => setSuccessMsg(null)} className="ml-1 text-slate-500 hover:text-slate-300"><X size={11} /></button>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-hidden">
                {tab === 'board' && <BoardView />}
                {tab === 'create' && (
                    <div className="h-full overflow-y-auto scrollbar-hide">
                        <CreateIssueForm onCreated={key => {
                            setSuccessMsg(`Issue ${key} creado`);
                            setTab('board');
                        }} />
                    </div>
                )}
                {tab === 'settings' && (
                    <div className="h-full overflow-y-auto scrollbar-hide">
                        <SettingsPanel onSaved={() => {
                            setSuccessMsg('Configuración guardada');
                            setTab('board');
                        }} />
                    </div>
                )}
            </div>
        </div>
    );
};
