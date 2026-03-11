import React, { useState, useEffect } from 'react';
import { useJiraStore } from '../../stores/jiraStore';
import {
    Settings, Plus, RefreshCw, X, CheckCircle, AlertCircle,
    Layers, Timer, Pin, Trash2, UserCircle, PlusCircle, ChevronRight,
} from 'lucide-react';
import {
    JiraConfig, loadConfig, emptyConfig, testConnectionWith, getActivityOptions,
} from '../jiraApi';

export function SettingsPanel({ onSaved }: { onSaved: (accountsChanged?: boolean) => void }) {
    // ── Account management via Zustand store ──────────────────────────────────
    const accounts = useJiraStore(s => s.accounts);
    const activeAccountId = useJiraStore(s => s.activeAccountId);
    const storeAddAccount = useJiraStore(s => s.addAccount);
    const storeUpdateAccount = useJiraStore(s => s.updateAccount);
    const storeRemoveAccount = useJiraStore(s => s.removeAccount);
    const storeSetActiveAccount = useJiraStore(s => s.setActiveAccount);
    const storeSaveActiveConfig = useJiraStore(s => s.saveActiveConfig);

    const [newAccountName, setNewAccountName] = useState('');
    const [showAddAccount, setShowAddAccount] = useState(false);

    const switchToAccount = (id: string) => {
        storeSetActiveAccount(id);
        const found = accounts.find(a => a.id === id);
        if (found) setCfg({ ...emptyConfig(), ...found.config });
        setTestResult(null);
    };

    const handleAddAccount = () => {
        const name = newAccountName.trim() || `Cuenta ${accounts.length + 1}`;
        const newAcc = storeAddAccount(name, emptyConfig());
        setCfg(emptyConfig());
        setNewAccountName('');
        setShowAddAccount(false);
        setTestResult(null);
        void newAcc;
    };

    const handleRenameAccount = (id: string, newName: string) => {
        storeUpdateAccount(id, { name: newName });
    };

    const handleDeleteAccount = (id: string) => {
        storeRemoveAccount(id);
        const remaining = accounts.filter(a => a.id !== id);
        const newActive = remaining.find(a => a.id !== id) ?? remaining[0];
        if (newActive) setCfg({ ...emptyConfig(), ...newActive.config });
    };

    // ── Config form state ─────────────────────────────────────────────────────
    const [cfg, setCfg] = useState<JiraConfig>(() => {
        const s = useJiraStore.getState();
        return s.getActiveConfig();
    });
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
    const [saving, setSaving] = useState(false);
    const [newFieldKey, setNewFieldKey] = useState('');
    const [newFieldVal, setNewFieldVal] = useState('');
    const [activityOpts, setActivityOpts] = useState<{ id: string; value: string }[]>([]);
    const [loadingActivityOpts, setLoadingActivityOpts] = useState(false);

    const loadActivityOpts = (fieldId: string, proj: string) => {
        if (!fieldId || !proj) return;
        setLoadingActivityOpts(true);
        getActivityOptions(proj)
            .then(list => setActivityOpts(list))
            .catch(() => setActivityOpts([]))
            .finally(() => setLoadingActivityOpts(false));
    };

    useEffect(() => {
        const saved = loadConfig();
        loadActivityOpts(saved.activityFieldId, saved.storiesProject || saved.defaultProject);
    }, []);

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const me = await testConnectionWith(cfg);
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
        storeSaveActiveConfig(cfg);
        setTimeout(() => { setSaving(false); onSaved(true); }, 400);
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

    const [section, setSection] = useState<'accounts' | 'connection' | 'tempo' | 'defaults' | 'stories' | 'custom'>('accounts');

    type SectionId = typeof section;
    const navItems: { id: SectionId; label: string; icon: React.ReactNode; badge?: number }[] = [
        { id: 'accounts', label: 'Cuentas', icon: <UserCircle size={14} />, badge: accounts.length },
        { id: 'connection', label: 'Conexión', icon: <Settings size={14} /> },
        { id: 'tempo', label: 'Tempo', icon: <Timer size={14} /> },
        { id: 'defaults', label: 'Defaults', icon: <Layers size={14} /> },
        { id: 'stories', label: 'Stories View', icon: <Pin size={14} /> },
        { id: 'custom', label: 'Custom Fields', icon: <ChevronRight size={14} />, badge: Object.keys(cfg.customFields).length || undefined },
    ];

    const isCfgSection = section !== 'accounts';

    return (
        <div className="flex h-full overflow-hidden">
            {/* ── Left nav ── */}
            <div className="w-44 shrink-0 border-r border-slate-800 flex flex-col py-3 px-2 gap-0.5 overflow-y-auto">
                <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider px-2 pb-2">Configuración</p>
                {navItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => setSection(item.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${section === item.id
                            ? 'bg-nexus-neon/10 text-nexus-neon border border-nexus-neon/20'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'
                            }`}
                    >
                        <span className="shrink-0">{item.icon}</span>
                        <span className="flex-1">{item.label}</span>
                        {item.badge != null && item.badge > 0 && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${section === item.id ? 'bg-nexus-neon/20 text-nexus-neon' : 'bg-slate-700 text-slate-400'}`}>
                                {item.badge}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── Right content ── */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                    {/* ── Cuentas ── */}
                    {section === 'accounts' && (
                        <>
                            <div>
                                <h3 className="text-sm font-bold text-slate-200 mb-0.5">Cuentas Jira</h3>
                                <p className="text-xs text-slate-500">Cada cuenta tiene su propia configuración de conexión y preferencias.</p>
                            </div>

                            <div className="space-y-2">
                                {accounts.length === 0 && (
                                    <p className="text-xs text-slate-500 py-2">No hay cuentas. Añade una para comenzar.</p>
                                )}
                                {accounts.map(acc => (
                                    <div
                                        key={acc.id}
                                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors cursor-pointer group ${acc.id === activeAccountId ? 'border-nexus-neon/40 bg-nexus-neon/5' : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'}`}
                                        onClick={() => acc.id !== activeAccountId && switchToAccount(acc.id)}
                                    >
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${acc.id === activeAccountId ? 'bg-nexus-neon' : 'bg-slate-600'}`} />
                                        <input
                                            type="text"
                                            defaultValue={acc.name}
                                            onBlur={e => { if (e.target.value.trim() && e.target.value !== acc.name) handleRenameAccount(acc.id, e.target.value.trim()); }}
                                            onClick={e => e.stopPropagation()}
                                            className={`flex-1 bg-transparent text-sm focus:outline-none min-w-0 cursor-text ${acc.id === activeAccountId ? 'text-white' : 'text-slate-400'}`}
                                            title="Clic para renombrar"
                                        />
                                        {acc.id === activeAccountId && (
                                            <span className="text-[10px] text-nexus-neon font-semibold shrink-0 px-1.5 py-0.5 bg-nexus-neon/10 rounded-full">activa</span>
                                        )}
                                        {acc.id !== activeAccountId && (
                                            <button
                                                onClick={e => { e.stopPropagation(); switchToAccount(acc.id); setSection('connection'); }}
                                                className="opacity-0 group-hover:opacity-100 text-[10px] text-slate-400 hover:text-nexus-neon px-2 py-0.5 rounded border border-transparent hover:border-nexus-neon/30 transition-all"
                                            >
                                                Activar
                                            </button>
                                        )}
                                        {accounts.length > 1 && (
                                            <button
                                                onClick={e => { e.stopPropagation(); handleDeleteAccount(acc.id); }}
                                                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-900/40 text-slate-500 hover:text-red-400 transition-all"
                                                title="Eliminar cuenta"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {showAddAccount ? (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={newAccountName}
                                        onChange={e => setNewAccountName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleAddAccount(); if (e.key === 'Escape') setShowAddAccount(false); }}
                                        placeholder="ej. Trabajo, Cliente X..."
                                        autoFocus
                                        className="flex-1 bg-slate-950 border border-nexus-neon/40 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
                                    />
                                    <button onClick={handleAddAccount} className="px-4 py-2 rounded-lg text-xs font-bold bg-nexus-neon text-slate-900 hover:bg-opacity-80 transition-colors">
                                        Crear
                                    </button>
                                    <button onClick={() => setShowAddAccount(false)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-700 transition-colors">
                                        <X size={14} />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowAddAccount(true)}
                                    className="flex items-center gap-1.5 text-xs text-nexus-neon hover:text-white transition-colors py-1"
                                >
                                    <PlusCircle size={13} /> Añadir cuenta
                                </button>
                            )}

                            {accounts.length > 0 && (
                                <div className="pt-2 border-t border-slate-800">
                                    <button
                                        onClick={() => setSection('connection')}
                                        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-nexus-neon transition-colors"
                                    >
                                        <Settings size={12} /> Configurar conexión de la cuenta activa
                                        <ChevronRight size={12} />
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {/* ── Conexión ── */}
                    {section === 'connection' && (
                        <>
                            <div>
                                <h3 className="text-sm font-bold text-slate-200 mb-0.5">Conexión</h3>
                                <p className="text-xs text-slate-500">
                                    {activeAccountId && accounts.find(a => a.id === activeAccountId)
                                        ? `Cuenta: ${accounts.find(a => a.id === activeAccountId)!.name}`
                                        : 'Credenciales de acceso a la API de Jira'}
                                </p>
                            </div>
                            {accounts.length === 0 && (
                                <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700 text-xs text-slate-400">
                                    Ve a <button onClick={() => setSection('accounts')} className="text-nexus-neon underline">Cuentas</button> y crea una cuenta primero.
                                </div>
                            )}
                            {field('Jira Base URL (ej. https://empresa.atlassian.net)', 'baseUrl')}
                            {field('Email de Atlassian', 'email')}
                            {field('API Token', 'apiToken', 'password')}
                            <div className="flex items-center gap-3">
                                <button onClick={handleTest} disabled={testing}
                                    className="flex items-center gap-1.5 px-4 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50">
                                    {testing ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                                    {testing ? 'Probando...' : 'Probar conexión'}
                                </button>
                                {testResult && (
                                    <div className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg flex-1 ${testResult.ok ? 'bg-green-900/20 border border-green-900/40 text-green-400' : 'bg-red-900/20 border border-red-900/40 text-red-400'}`}>
                                        {testResult.ok ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                                        {testResult.msg}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* ── Tempo ── */}
                    {section === 'tempo' && (
                        <>
                            <div>
                                <h3 className="text-sm font-bold text-slate-200 mb-0.5 flex items-center gap-2"><Timer size={14} /> Tempo</h3>
                                <p className="text-xs text-slate-500">Integración con Tempo Timesheets para registrar tiempo en issues.</p>
                            </div>
                            {field('Tempo API Token', 'tempoToken', 'password')}
                            <p className="text-xs text-slate-500">Obtén tu token en <span className="text-slate-300 font-mono">app.tempo.io → Settings → API Integration</span>.</p>
                            <p className="text-xs text-slate-600">El account ID del autor se toma del campo "Account ID del asignado por defecto" en la sección Defaults.</p>
                        </>
                    )}

                    {/* ── Defaults ── */}
                    {section === 'defaults' && (
                        <>
                            <div>
                                <h3 className="text-sm font-bold text-slate-200 mb-0.5">Valores por defecto</h3>
                                <p className="text-xs text-slate-500">Se usan al crear issues desde el formulario.</p>
                            </div>
                            {field('Clave de proyecto por defecto (ej. MYPROJ)', 'defaultProject')}
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
                        </>
                    )}

                    {/* ── Stories View ── */}
                    {section === 'stories' && (
                        <>
                            <div>
                                <h3 className="text-sm font-bold text-slate-200 mb-0.5">Stories View — Jerarquía</h3>
                                <p className="text-xs text-slate-500">Configura los tipos de issues y el campo Activity para la vista de 3 columnas.</p>
                            </div>
                            {field('Proyecto para vista Stories (ej. MYPROJ)', 'storiesProject')}
                            <div className="grid grid-cols-2 gap-3">
                                {field('Tipo Epic', 'epicType')}
                                {field('Tipo Business Story', 'businessStoryType')}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {field('Tipo Story (Técnica)', 'storyType')}
                                {field('Tipo Task', 'taskType')}
                            </div>
                            {field('ID campo Activity (ej. customfield_10115)', 'activityFieldId')}
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Valor de Activity</label>
                                <div className="flex gap-2">
                                    <select
                                        value={cfg.activityValue}
                                        onChange={e => {
                                            const found = activityOpts.find(a => a.value === e.target.value);
                                            setCfg(c => ({ ...c, activityValue: e.target.value, activityId: found?.id ?? c.activityId }));
                                        }}
                                        disabled={activityOpts.length === 0}
                                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon disabled:text-slate-600"
                                    >
                                        <option value="">{activityOpts.length === 0 ? 'Carga las opciones →' : 'Selecciona un valor'}</option>
                                        {activityOpts.map(a => <option key={a.id} value={a.value}>{a.value}</option>)}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => loadActivityOpts(cfg.activityFieldId, cfg.storiesProject || cfg.defaultProject)}
                                        disabled={!cfg.activityFieldId || !(cfg.storiesProject || cfg.defaultProject) || loadingActivityOpts}
                                        className="px-3 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                                    >
                                        {loadingActivityOpts ? <RefreshCw size={12} className="animate-spin" /> : 'Recargar'}
                                    </button>
                                </div>
                                {cfg.activityId && <p className="text-[10px] text-slate-600 mt-1 font-mono">ID: {cfg.activityId}</p>}
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Statuses con color especial (separados por coma)</label>
                                <input
                                    type="text"
                                    value={(cfg.releasedStatuses ?? []).join(', ')}
                                    onChange={e => setCfg(c => ({ ...c, releasedStatuses: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                                    placeholder="Released, Discarded"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon"
                                />
                            </div>
                            {/* Defect configuration */}
                            <div className="pt-2 border-t border-slate-800 space-y-3">
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Defectos / Bugs</p>
                                {field('Tipo de Defecto (ej. Defect, Bug, Defecto)', 'defectType')}
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">
                                        Proyectos de Defectos <span className="text-slate-600">(ej. NTCQA, BUGS) — vacío = busca en todos</span>
                                    </label>
                                    <div className="flex flex-wrap gap-1.5 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 focus-within:border-nexus-neon transition-colors min-h-[40px]">
                                        {(cfg.defectProjects ?? []).map(proj => (
                                            <span key={proj} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-nexus-neon/10 border border-nexus-neon/30 text-nexus-neon text-xs font-mono">
                                                {proj}
                                                <button
                                                    type="button"
                                                    onClick={() => setCfg(c => ({ ...c, defectProjects: (c.defectProjects ?? []).filter(p => p !== proj) }))}
                                                    className="hover:text-white transition-colors ml-0.5"
                                                ><X size={10} /></button>
                                            </span>
                                        ))}
                                        <input
                                            type="text"
                                            placeholder={!(cfg.defectProjects ?? []).length ? 'NTCQA, BUGS...' : 'Agregar...'}
                                            className="flex-1 min-w-[80px] bg-transparent text-sm text-slate-100 focus:outline-none placeholder:text-slate-700"
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                                                    e.preventDefault();
                                                    const val = (e.target as HTMLInputElement).value.trim().replace(/,/g, '').toUpperCase();
                                                    if (val && !(cfg.defectProjects ?? []).includes(val)) {
                                                        setCfg(c => ({ ...c, defectProjects: [...(c.defectProjects ?? []), val] }));
                                                    }
                                                    (e.target as HTMLInputElement).value = '';
                                                }
                                            }}
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-600 mt-1">Presiona Enter, coma o espacio para agregar cada proyecto.</p>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── Custom Fields ── */}
                    {section === 'custom' && (
                        <>
                            <div>
                                <h3 className="text-sm font-bold text-slate-200 mb-0.5">Campos personalizados</h3>
                                <p className="text-xs text-slate-500">
                                    Campos como <code className="bg-slate-800 px-1 rounded font-mono">customfield_10020</code> que se envían automáticamente al crear un issue.
                                </p>
                            </div>

                            {Object.entries(cfg.customFields).length === 0 && (
                                <p className="text-xs text-slate-600 py-2">No hay campos personalizados configurados.</p>
                            )}

                            <div className="space-y-2">
                                {Object.entries(cfg.customFields).map(([k, v]) => (
                                    <div key={k} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700">
                                        <span className="font-mono text-nexus-neon/80 text-xs flex-1">{k}</span>
                                        <span className="text-slate-300 text-xs flex-1 truncate">{JSON.stringify(v)}</span>
                                        <button onClick={() => removeCustomField(k)} className="p-1 rounded hover:bg-red-900/30 text-slate-500 hover:text-red-400 transition-colors">
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div className="flex gap-2">
                                <input value={newFieldKey} onChange={e => setNewFieldKey(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addCustomField()}
                                    placeholder="customfield_XXXXX"
                                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-nexus-neon font-mono" />
                                <input value={newFieldVal} onChange={e => setNewFieldVal(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addCustomField()}
                                    placeholder="valor"
                                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-nexus-neon" />
                                <button onClick={addCustomField} className="px-3 py-2 text-xs bg-nexus-neon text-nexus-darker rounded-lg font-bold hover:bg-opacity-80 transition-colors">
                                    <Plus size={13} />
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* ── Footer: save button (only for cfg sections) ── */}
                {isCfgSection && (
                    <div className="shrink-0 px-6 py-3 border-t border-slate-800 bg-slate-950/50 flex items-center justify-end gap-3">
                        {saving && <span className="text-xs text-slate-500">Guardando...</span>}
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-5 py-2 rounded-lg bg-nexus-accent hover:bg-opacity-80 text-white font-bold text-xs transition-colors disabled:opacity-50"
                        >
                            {saving ? 'Guardando...' : 'Guardar configuración'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
