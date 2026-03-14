import React, { useState } from 'react';
import { Github, Gitlab, Plus, Pencil, Trash2, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useGitStore, type GitAccount } from '../stores/gitStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AccountManagerModalProps {
    repoPath: string | null;
    onClose: () => void;
}

type VerifyState = 'idle' | 'loading' | { ok: true; username: string } | { ok: false; error: string };

const DEFAULT_URLS = {
    github: 'https://api.github.com',
    gitlab: 'https://gitlab.com',
};

async function verifyToken(provider: 'github' | 'gitlab', url: string, token: string): Promise<string> {
    if (provider === 'github') {
        const res = await fetch(`${url || DEFAULT_URLS.github}/user`, {
            headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = await res.json();
        return data.login;
    } else {
        const base = url || DEFAULT_URLS.gitlab;
        const res = await fetch(`${base}/api/v4/user`, {
            headers: { 'PRIVATE-TOKEN': token },
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = await res.json();
        return data.username;
    }
}

interface AccountFormState {
    alias: string;
    provider: 'github' | 'gitlab';
    url: string;
    token: string;
}

const EMPTY_FORM: AccountFormState = {
    alias: '',
    provider: 'github',
    url: DEFAULT_URLS.github,
    token: '',
};

export const AccountManagerModal: React.FC<AccountManagerModalProps> = ({ repoPath, onClose }) => {
    const accounts = useGitStore(s => s.accounts);
    const repoAccounts = useGitStore(s => s.repoAccounts);
    const addAccount = useGitStore(s => s.addAccount);
    const updateAccount = useGitStore(s => s.updateAccount);
    const removeAccount = useGitStore(s => s.removeAccount);
    const setRepoAccount = useGitStore(s => s.setRepoAccount);

    const activeAccountId = repoPath ? repoAccounts[repoPath] : undefined;

    const [editingId, setEditingId] = useState<string | 'new' | null>(null);
    const [form, setForm] = useState<AccountFormState>(EMPTY_FORM);
    const [verifyState, setVerifyState] = useState<VerifyState>('idle');

    const startAdd = () => {
        setEditingId('new');
        setForm(EMPTY_FORM);
        setVerifyState('idle');
    };

    const startEdit = (acc: GitAccount) => {
        setEditingId(acc.id);
        setForm({ alias: acc.alias, provider: acc.provider, url: acc.url, token: acc.token });
        setVerifyState('idle');
    };

    const cancelEdit = () => { setEditingId(null); setVerifyState('idle'); };

    const handleProviderChange = (p: 'github' | 'gitlab') => {
        setForm(f => ({ ...f, provider: p, url: DEFAULT_URLS[p] }));
    };

    const handleVerify = async () => {
        setVerifyState('loading');
        try {
            const username = await verifyToken(form.provider, form.url, form.token);
            setVerifyState({ ok: true, username });
        } catch (e: any) {
            setVerifyState({ ok: false, error: e.message || 'Error desconocido' });
        }
    };

    const handleSave = () => {
        if (!form.alias.trim() || !form.token.trim()) return;
        if (editingId === 'new') {
            addAccount({ alias: form.alias.trim(), provider: form.provider, url: form.url, token: form.token });
        } else if (editingId) {
            updateAccount(editingId, { alias: form.alias.trim(), provider: form.provider, url: form.url, token: form.token });
        }
        setEditingId(null);
        setVerifyState('idle');
    };

    const handleDelete = (id: string) => {
        removeAccount(id);
        if (editingId === id) setEditingId(null);
    };

    return (
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="w-[540px] max-w-[95vw] max-h-[85vh] p-0 flex flex-col bg-slate-900 border-slate-700">
                <DialogHeader className="px-6 py-4 border-b border-slate-800 shrink-0">
                    <DialogTitle className="text-base font-bold text-white">Cuentas Git</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                    {/* Sección A: Repo actual */}
                    {repoPath && (
                        <section>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Repo actual</p>
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/60 border border-slate-700">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-slate-400 truncate font-mono">{repoPath}</p>
                                    {activeAccountId ? (
                                        <p className="text-sm font-medium text-white mt-0.5">
                                            {accounts.find(a => a.id === activeAccountId)?.alias ?? 'Cuenta desconocida'}
                                        </p>
                                    ) : (
                                        <p className="text-sm text-slate-500 mt-0.5">Sin cuenta asignada</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <Select
                                        value={activeAccountId ?? 'none'}
                                        onValueChange={(v) => setRepoAccount(repoPath, v === 'none' ? null : v)}
                                    >
                                        <SelectTrigger className="w-[180px] h-8 bg-slate-950 border-slate-700 text-xs">
                                            <SelectValue placeholder="Sin cuenta" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Sin cuenta</SelectItem>
                                            {accounts.map(a => (
                                                <SelectItem key={a.id} value={a.id}>{a.alias}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Sección B: Todas las cuentas */}
                    <section>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Cuentas guardadas</p>

                        <div className="space-y-2">
                            {accounts.length === 0 && editingId !== 'new' && (
                                <p className="text-xs text-slate-500 py-2">No hay cuentas. Añade una.</p>
                            )}

                            {accounts.map(acc => (
                                <div key={acc.id}>
                                    {editingId === acc.id ? (
                                        <AccountForm
                                            form={form}
                                            verifyState={verifyState}
                                            onChange={setForm}
                                            onProviderChange={handleProviderChange}
                                            onVerify={handleVerify}
                                            onSave={handleSave}
                                            onCancel={cancelEdit}
                                        />
                                    ) : (
                                        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800/40 border border-slate-700/60 group">
                                            {acc.provider === 'github'
                                                ? <Github size={14} className="text-slate-400 shrink-0" />
                                                : <Gitlab size={14} className="text-slate-400 shrink-0" />
                                            }
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-200">{acc.alias}</p>
                                                <p className="text-xs text-slate-500 truncate">{acc.url}</p>
                                            </div>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => startEdit(acc)}
                                                    className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                                                >
                                                    <Pencil size={13} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(acc.id)}
                                                    className="p-1 rounded hover:bg-red-900/40 text-slate-400 hover:text-red-400 transition-colors"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Formulario de nueva cuenta */}
                            {editingId === 'new' && (
                                <AccountForm
                                    form={form}
                                    verifyState={verifyState}
                                    onChange={setForm}
                                    onProviderChange={handleProviderChange}
                                    onVerify={handleVerify}
                                    onSave={handleSave}
                                    onCancel={cancelEdit}
                                />
                            )}

                            {editingId === null && (
                                <Button
                                    variant="ghost"
                                    onClick={startAdd}
                                    className="flex items-center gap-1.5 text-xs text-microtermix-neon hover:text-microtermix-neon hover:bg-microtermix-neon/10 transition-colors h-8 px-2"
                                >
                                    <Plus size={13} /> Añadir cuenta
                                </Button>
                            )}
                        </div>
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    );
};

// ── Sub-componente del formulario ────────────────────────────────────────────

interface AccountFormProps {
    form: AccountFormState;
    verifyState: VerifyState;
    onChange: (f: AccountFormState) => void;
    onProviderChange: (p: 'github' | 'gitlab') => void;
    onVerify: () => void;
    onSave: () => void;
    onCancel: () => void;
}

const AccountForm: React.FC<AccountFormProps> = ({ form, verifyState, onChange, onProviderChange, onVerify, onSave, onCancel }) => {
    const canSave = form.alias.trim().length > 0 && form.token.trim().length > 0;

    return (
        <div className="rounded-lg border border-microtermix-accent/40 bg-slate-800/60 p-4 space-y-4">
            {/* Alias */}
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Alias</label>
                <Input
                    type="text"
                    value={form.alias}
                    onChange={e => onChange({ ...form, alias: e.target.value })}
                    placeholder="Trabajo GitHub, Personal GitLab..."
                    className="bg-slate-950 border-slate-700 h-9"
                />
            </div>

            {/* Proveedor */}
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Proveedor</label>
                <div className="flex gap-2">
                    {(['github', 'gitlab'] as const).map(p => (
                        <button
                            key={p}
                            type="button"
                            onClick={() => onProviderChange(p)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition-all ${form.provider === p
                                    ? 'border-microtermix-accent bg-microtermix-accent/10 text-white'
                                    : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500'
                                }`}
                        >
                            {p === 'github' ? <Github size={12} /> : <Gitlab size={12} />}
                            {p === 'github' ? 'GitHub' : 'GitLab'}
                        </button>
                    ))}
                </div>
            </div>

            {/* URL */}
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">URL</label>
                <Input
                    type="url"
                    value={form.url}
                    onChange={e => onChange({ ...form, url: e.target.value })}
                    className="bg-slate-950 border-slate-700 h-9"
                />
            </div>

            {/* Token + Verificar */}
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Token (PAT)</label>
                <div className="flex gap-2">
                    <Input
                        type="password"
                        value={form.token}
                        onChange={e => onChange({ ...form, token: e.target.value })}
                        placeholder={form.provider === 'github' ? 'ghp_...' : 'glpat-...'}
                        className="flex-1 bg-slate-950 border-slate-700 font-mono h-9"
                    />
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={onVerify}
                        disabled={!form.token || verifyState === 'loading'}
                        className="h-9"
                    >
                        {verifyState === 'loading' ? <Loader2 size={12} className="animate-spin" /> : 'Verificar'}
                    </Button>
                </div>

                {/* Resultado verificación */}
                {typeof verifyState === 'object' && verifyState.ok && (
                    <p className="flex items-center gap-1 text-xs text-green-400 mt-2">
                        <CheckCircle size={11} /> Autenticado como <strong>{verifyState.username}</strong>
                    </p>
                )}
                {typeof verifyState === 'object' && !verifyState.ok && (
                    <p className="flex items-center gap-1 text-xs text-red-400 mt-2">
                        <XCircle size={11} /> {verifyState.error}
                    </p>
                )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
                <Button
                    type="button"
                    variant="ghost"
                    onClick={onCancel}
                    className="text-slate-400 hover:text-white"
                >
                    Cancelar
                </Button>
                <Button
                    type="button"
                    onClick={onSave}
                    disabled={!canSave}
                    className="bg-microtermix-neon text-slate-900 hover:bg-microtermix-neon/80 font-bold"
                >
                    Guardar
                </Button>
            </div>
        </div>
    );
};
