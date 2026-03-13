import { useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2, Plus, Trash2, Server } from 'lucide-react';
import { JenkinsConfig, jenkinsTestConnection } from '../../services/jenkinsApi';
import { useJenkinsStore } from '../../stores/jenkinsStore';

function AccountForm({
    account,
    onSave,
    onCancel,
    onDelete
}: {
    account?: JenkinsConfig;
    onSave: (acc: Omit<JenkinsConfig, 'id'>) => void;
    onCancel: () => void;
    onDelete?: () => void;
}) {
    const [draft, setDraft] = useState<Omit<JenkinsConfig, 'id'>>({
        name: account?.name || '',
        baseUrl: account?.baseUrl || '',
        user: account?.user || '',
        token: account?.token || ''
    });

    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState<'ok' | 'error' | null>(null);
    const [errMsg, setErrMsg] = useState('');
    const [version, setVersion] = useState('');

    const handleTest = async () => {
        setTesting(true); setResult(null); setErrMsg(''); setVersion('');
        try {
            const v = await jenkinsTestConnection(draft as JenkinsConfig);
            setVersion(v);
            setResult('ok');
        } catch (e: any) {
            setResult('error');
            setErrMsg(e?.message ?? 'Connection failed');
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg space-y-4 relative">
            {onDelete && (
                <button
                    onClick={onDelete}
                    className="absolute top-4 right-4 p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                    title="Delete Account"
                >
                    <Trash2 size={14} />
                </button>
            )}

            <h3 className="text-sm font-semibold text-slate-200">
                {account ? 'Edit Account' : 'New Jenkins Account'}
            </h3>

            <div className="grid grid-cols-2 gap-4">
                <label className="block col-span-2 sm:col-span-1">
                    <span className="text-xs text-slate-400 mb-1 block">Account Name (e.g. Prod, Staging)</span>
                    <input
                        className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500/50"
                        placeholder="My Jenkins"
                        value={draft.name}
                        onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                    />
                </label>

                <label className="block col-span-2 sm:col-span-1">
                    <span className="text-xs text-slate-400 mb-1 block">Jenkins URL</span>
                    <input
                        className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500/50"
                        placeholder="https://jenkins.example.com"
                        value={draft.baseUrl}
                        onChange={e => setDraft(d => ({ ...d, baseUrl: e.target.value }))}
                    />
                </label>

                <label className="block col-span-2 sm:col-span-1">
                    <span className="text-xs text-slate-400 mb-1 block">Username</span>
                    <input
                        className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500/50"
                        placeholder="admin"
                        value={draft.user}
                        onChange={e => setDraft(d => ({ ...d, user: e.target.value }))}
                    />
                </label>

                <label className="block col-span-2 sm:col-span-1">
                    <span className="text-xs text-slate-400 mb-1 block">API Token</span>
                    <input
                        type="password"
                        className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500/50"
                        placeholder="11a2b3c4d5e6f7g8h9..."
                        value={draft.token}
                        onChange={e => setDraft(d => ({ ...d, token: e.target.value }))}
                    />
                </label>
            </div>

            <div className="flex items-center gap-2 pt-2">
                <button
                    onClick={handleTest}
                    disabled={testing || !draft.baseUrl}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded transition-colors"
                >
                    {testing ? <Loader2 size={13} className="animate-spin" /> : <Server size={13} />}
                    Test
                </button>
                <button
                    onClick={() => onSave(draft)}
                    disabled={!draft.baseUrl || !draft.name}
                    className="px-4 py-1.5 text-xs bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 border border-sky-500/30 rounded disabled:opacity-50 transition-colors"
                >
                    Save Account
                </button>
                <button
                    onClick={onCancel}
                    className="px-4 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                    Cancel
                </button>

                <div className="ml-auto">
                    {result === 'ok' && (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                            <CheckCircle2 size={13} /> Connected ({version})
                        </div>
                    )}
                    {result === 'error' && (
                        <div className="flex items-center gap-1.5 text-xs text-red-400 max-w-[200px] truncate" title={errMsg}>
                            <AlertCircle size={13} className="shrink-0" /> {errMsg}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export function JenkinsSettings({ onSaved }: { onSaved?: () => void }) {
    const accounts = useJenkinsStore(s => s.accounts);
    const addAccount = useJenkinsStore(s => s.addAccount);
    const updateAccount = useJenkinsStore(s => s.updateAccount);
    const removeAccount = useJenkinsStore(s => s.removeAccount);

    const [editingId, setEditingId] = useState<string | 'new' | null>(null);

    return (
        <div className="flex-1 overflow-y-auto p-6 bg-[#020617]">
            <div className="max-w-3xl mx-auto space-y-6">

                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-semibold text-slate-100">Jenkins Accounts</h2>
                        <p className="text-xs text-slate-400 mt-0.5">Configure your Jenkins servers to view pipelines and trigger builds.</p>
                    </div>
                    {editingId !== 'new' && (
                        <button
                            onClick={() => setEditingId('new')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded-md text-xs font-medium transition-colors shadow-sm"
                        >
                            <Plus size={14} /> Add Account
                        </button>
                    )}
                </div>

                {editingId === 'new' && (
                    <AccountForm
                        onSave={(draft) => {
                            addAccount(draft);
                            setEditingId(null);
                        }}
                        onCancel={() => setEditingId(null)}
                    />
                )}

                {accounts.length === 0 && editingId !== 'new' && (
                    <div className="border border-slate-800 border-dashed rounded-xl p-8 text-center bg-slate-900/30">
                        <Server size={32} className="mx-auto text-slate-700 mb-3" />
                        <h3 className="text-sm font-medium text-slate-300">No accounts configured</h3>
                        <p className="text-xs text-slate-500 mt-1 mb-4">You haven't added any Jenkins servers yet.</p>
                        <button
                            onClick={() => setEditingId('new')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md text-xs transition-colors"
                        >
                            <Plus size={13} /> Add your first account
                        </button>
                    </div>
                )}

                <div className="grid gap-4">
                    {accounts.map(acc => (
                        editingId === acc.id ? (
                            <AccountForm
                                key={acc.id}
                                account={acc}
                                onSave={(draft) => {
                                    updateAccount(acc.id!, draft);
                                    setEditingId(null);
                                }}
                                onCancel={() => setEditingId(null)}
                                onDelete={() => {
                                    if (confirm('Are you sure you want to delete this account?')) {
                                        removeAccount(acc.id!);
                                        setEditingId(null);
                                    }
                                }}
                            />
                        ) : (
                            <div key={acc.id} className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded bg-sky-500/10 flex items-center justify-center border border-sky-500/20 text-sky-400">
                                        <Server size={14} />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-medium text-slate-200">{acc.name}</h4>
                                        <p className="text-xs text-slate-500 font-mono">{acc.baseUrl}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setEditingId(acc.id!)}
                                    className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
                                >
                                    Edit
                                </button>
                            </div>
                        )
                    ))}
                </div>

            </div>
        </div>
    );
}