import { useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2, Plus, Trash2, Server } from 'lucide-react';
import { JenkinsConfig, jenkinsTestConnection } from '../../services/jenkinsApi';
import { useJenkinsStore } from '../../stores/jenkinsStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

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
        <div className="bg-card border border-border p-5 rounded-2xl space-y-4 relative">
            {onDelete && (
                <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onDelete}
                    className="absolute top-4 right-4 text-muted-foreground hover:text-red-400 hover:bg-red-400/10"
                    title="Eliminar cuenta"
                >
                    <Trash2 size={14} />
                </Button>
            )}

            <h3 className="text-sm font-black text-foreground uppercase tracking-widest">
                {account ? 'Editar Cuenta' : 'Nueva Cuenta Jenkins'}
            </h3>

            <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1 space-y-1.5">
                    <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Nombre</Label>
                    <Input
                        placeholder="Prod, Staging..."
                        value={draft.name}
                        onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                        className="h-9 rounded-xl text-xs"
                    />
                </div>
                <div className="col-span-2 sm:col-span-1 space-y-1.5">
                    <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Jenkins URL</Label>
                    <Input
                        placeholder="https://jenkins.example.com"
                        value={draft.baseUrl}
                        onChange={e => setDraft(d => ({ ...d, baseUrl: e.target.value }))}
                        className="h-9 rounded-xl text-xs font-mono"
                    />
                </div>
                <div className="col-span-2 sm:col-span-1 space-y-1.5">
                    <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Usuario</Label>
                    <Input
                        placeholder="admin"
                        value={draft.user}
                        onChange={e => setDraft(d => ({ ...d, user: e.target.value }))}
                        className="h-9 rounded-xl text-xs"
                    />
                </div>
                <div className="col-span-2 sm:col-span-1 space-y-1.5">
                    <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">API Token</Label>
                    <Input
                        type="password"
                        placeholder="11a2b3c4d5e6..."
                        value={draft.token}
                        onChange={e => setDraft(d => ({ ...d, token: e.target.value }))}
                        className="h-9 rounded-xl text-xs font-mono"
                    />
                </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTest}
                    disabled={testing || !draft.baseUrl}
                    className="h-8 gap-1.5 text-[10px] font-black uppercase tracking-widest"
                >
                    {testing ? <Loader2 size={12} className="animate-spin" /> : <Server size={12} />}
                    Test
                </Button>
                <Button
                    size="sm"
                    onClick={() => onSave(draft)}
                    disabled={!draft.baseUrl || !draft.name}
                    className="h-8 text-[10px] font-black uppercase tracking-widest bg-sky-500 hover:bg-sky-600 text-white"
                >
                    Guardar
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onCancel}
                    className="h-8 text-[10px] font-black uppercase tracking-widest text-muted-foreground"
                >
                    Cancelar
                </Button>

                <div className="ml-auto">
                    {result === 'ok' && (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-black">
                            <CheckCircle2 size={13} /> Conectado ({version})
                        </div>
                    )}
                    {result === 'error' && (
                        <div className="flex items-center gap-1.5 text-xs text-red-400 max-w-[200px] truncate font-black" title={errMsg}>
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
        <div className="flex-1 overflow-y-auto p-6 bg-background">
            <div className="max-w-2xl mx-auto space-y-5">

                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-sm font-black text-foreground uppercase tracking-widest">Jenkins Accounts</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Configurá tus servidores Jenkins para ver pipelines y ejecutar builds.</p>
                    </div>
                    {editingId !== 'new' && (
                        <Button
                            size="sm"
                            onClick={() => setEditingId('new')}
                            className="h-8 gap-1.5 text-[10px] font-black uppercase tracking-widest bg-sky-500 hover:bg-sky-600 text-white"
                        >
                            <Plus size={13} /> Add Account
                        </Button>
                    )}
                </div>

                {editingId === 'new' && (
                    <AccountForm
                        onSave={(draft) => { addAccount(draft); setEditingId(null); onSaved?.(); }}
                        onCancel={() => setEditingId(null)}
                    />
                )}

                {accounts.length === 0 && editingId !== 'new' && (
                    <div className="border border-dashed border-border rounded-2xl p-10 text-center bg-muted/10">
                        <Server size={28} className="mx-auto text-muted-foreground/30 mb-3" />
                        <h3 className="text-sm font-black text-foreground uppercase tracking-widest">Sin cuentas</h3>
                        <p className="text-xs text-muted-foreground mt-1 mb-4">No configuraste ningún servidor Jenkins todavía.</p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingId('new')}
                            className="gap-1.5 text-[10px] font-black uppercase tracking-widest"
                        >
                            <Plus size={13} /> Agregar primera cuenta
                        </Button>
                    </div>
                )}

                <div className="space-y-3">
                    {accounts.map(acc =>
                        editingId === acc.id ? (
                            <AccountForm
                                key={acc.id}
                                account={acc}
                                onSave={(draft) => { updateAccount(acc.id!, draft); setEditingId(null); onSaved?.(); }}
                                onCancel={() => setEditingId(null)}
                                onDelete={() => {
                                    if (confirm('¿Eliminár esta cuenta?')) {
                                        removeAccount(acc.id!);
                                        setEditingId(null);
                                    }
                                }}
                            />
                        ) : (
                            <div
                                key={acc.id}
                                className="flex items-center justify-between px-4 py-3 bg-card border border-border rounded-xl hover:border-border/80 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center border border-sky-500/20 text-sky-400 shrink-0">
                                        <Server size={14} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-black text-foreground uppercase tracking-tight">{acc.name}</p>
                                        <p className="text-[10px] text-muted-foreground font-mono truncate">{acc.baseUrl}</p>
                                    </div>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setEditingId(acc.id!)}
                                    className="h-7 text-[9px] font-black uppercase tracking-widest shrink-0"
                                >
                                    Editar
                                </Button>
                            </div>
                        )
                    )}
                </div>

            </div>
        </div>
    );
}
