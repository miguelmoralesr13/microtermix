import React, { useState, useEffect } from 'react';
import { 
    Edit2, RefreshCw, CheckCircle, Eye, EyeOff, 
    ClipboardPaste 
} from 'lucide-react';
import { useAwsStore, AwsAccount } from '../../stores/awsStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { cwGetLogGroups, CwCredentials } from '../../services/cloudwatchApi';
import { parseAwsCredentialBlock } from './cwUtils';
import { ProfileOverrideCard } from './ProfileOverrideCard';

interface AccountDetailViewProps {
    account: AwsAccount;
    onSaved: () => void;
}

export const AccountDetailView: React.FC<AccountDetailViewProps> = ({ account, onSaved }) => {
    const { updateAccount, setAccountStatus } = useAwsStore();

    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState<Omit<AwsAccount, 'id'>>({ ...account });
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState<'ok' | 'error' | null>(null);
    const [showPaste, setShowPaste] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [showSecret, setShowSecret] = useState(false);
    const [isAutoProcessing, setIsAutoProcessing] = useState(false);

    useEffect(() => {
        if (!isEditing) setDraft({ ...account });
    }, [account.id, isEditing, account]);

    const handleSave = (customDraft?: Omit<AwsAccount, 'id'>) => {
        updateAccount(account.id, customDraft || draft);
        setIsEditing(false);
        onSaved();
    };

    const handleTest = async () => {
        setTesting(true);
        setResult(null);
        try {
            await cwGetLogGroups(draft as CwCredentials, '');
            setResult('ok');
            // Restore status to valid on success
            setAccountStatus(account.id, 'valid');
        } catch (e) {
            setResult('error');
        } finally {
            setTesting(false);
        }
    };

    async function applyPaste(text: string) {
        const parsed = parseAwsCredentialBlock(text);
        if (Object.keys(parsed).length === 0) return;
        
        const newDraft = { ...draft, ...parsed } as Omit<AwsAccount, 'id'>;
        setDraft(newDraft);
        setPasteText('');
        setShowPaste(false);
        
        setIsAutoProcessing(true);
        await handleTest();
        setIsAutoProcessing(false);
        handleSave(newDraft);
    }

    return (
        <div className="xl:col-span-3 space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
                        {account.name}
                        <Badge variant="outline" className={cn(
                            "text-[10px] uppercase font-black tracking-widest",
                            account.status === 'expired' ? "border-red-500 text-red-500 bg-red-500/10" : "border-white/5 text-slate-500"
                        )}>
                            {account.status === 'expired' ? 'SESIÓN EXPIRADA' : account.region}
                        </Badge>
                    </h2>
                    <p className="text-xs text-slate-600 font-mono">ID: {account.id}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        variant={isEditing ? "ghost" : "outline"}
                        size="sm"
                        onClick={() => setIsEditing(!isEditing)}
                        className={cn("h-8 gap-2 border-white/5", isEditing ? "text-slate-500" : "hover:bg-white/5")}
                    >
                        {isEditing ? "Cancelar" : <><Edit2 className="w-3.5 h-3.5" /> Editar</>}
                    </Button>
                </div>
            </div>

            <div className={cn(
                "p-6 rounded-[2rem] border transition-all duration-300 bg-slate-900/20 backdrop-blur-md min-h-[300px]",
                isEditing ? "border-microtermix-neon/20 ring-1 ring-microtermix-neon/10" : 
                (account.status === 'expired' ? "border-red-500/30 ring-1 ring-red-500/10 shadow-[0_0_20px_-10px_rgba(239,68,68,0.3)]" : "border-white/5")
            )}>
                {isEditing ? (
                    <div className="space-y-6">
                        <div className="flex justify-end">
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setShowPaste(!showPaste)}
                                className={cn("h-7 px-3 text-[10px] font-black uppercase tracking-widest gap-2", showPaste ? "text-microtermix-neon bg-microtermix-neon/10" : "text-slate-500")}
                            >
                                <ClipboardPaste className="w-3 h-3" /> Quick Paste
                            </Button>
                        </div>

                        {showPaste && (
                            <div className="relative group">
                                <textarea
                                    autoFocus
                                    value={pasteText}
                                    onChange={e => setPasteText(e.target.value)}
                                    onPaste={(e) => applyPaste(e.clipboardData.getData('text'))}
                                    placeholder={`aws_access_key_id=ASIA...\naws_secret_access_key=...`}
                                    className="w-full bg-black/60 border border-white/10 rounded-2xl p-4 text-xs font-mono text-microtermix-neon placeholder:text-slate-800 min-h-[160px] focus:ring-2 focus:ring-microtermix-neon/30 outline-none transition-all"
                                />
                                {isAutoProcessing && (
                                    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl gap-3">
                                        <RefreshCw className="w-8 h-8 text-microtermix-neon animate-spin" />
                                        <p className="text-[10px] font-black text-microtermix-neon animate-pulse uppercase tracking-[0.2em]">Configurando...</p>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">Región</Label>
                                <Input value={draft.region} onChange={e => setDraft({...draft, region: e.target.value})} className="bg-black/40 border-white/5 h-10 rounded-xl" />
                            </div>
                            <div className="space-y-2 text-right">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">Session Token</Label>
                                <Input placeholder="Opcional" value={draft.sessionToken || ''} onChange={e => setDraft({...draft, sessionToken: e.target.value})} className="bg-black/40 border-white/5 h-10 rounded-xl text-right" />
                            </div>
                            <div className="col-span-2 space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">Access Key ID</Label>
                                <Input value={draft.accessKeyId} onChange={e => setDraft({...draft, accessKeyId: e.target.value})} className="bg-black/40 border-white/5 h-10 rounded-xl font-mono text-xs" />
                            </div>
                            <div className="col-span-2 space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">Secret Access Key</Label>
                                <div className="relative">
                                    <Input 
                                        type={showSecret ? "text" : "password"} 
                                        value={draft.secretAccessKey} 
                                        onChange={e => setDraft({...draft, secretAccessKey: e.target.value})} 
                                        className="bg-black/40 border-white/5 h-10 rounded-xl font-mono text-xs pr-10" 
                                    />
                                    <button onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">{showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
                                </div>
                            </div>
                        </div>
                        <Button onClick={() => handleSave()} className="w-full bg-microtermix-neon text-microtermix-darker font-black uppercase tracking-widest h-11 rounded-xl shadow-lg shadow-microtermix-neon/10 hover:scale-[1.01] transition-all">
                            Salvar Configuración
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-8">
                        <div className={cn(
                            "flex items-center justify-between p-5 bg-black/40 rounded-2xl border transition-all duration-500",
                            account.status === 'expired' ? "border-red-500/50 bg-red-500/5" : "border-white/5"
                        )}>
                            <div className="flex items-center gap-4">
                                <div className={cn(
                                    "p-2.5 rounded-xl transition-all",
                                    result === 'ok' ? "bg-emerald-500/10 text-emerald-400" : 
                                    (account.status === 'expired' ? "bg-red-500/10 text-red-500" : "bg-slate-800 text-slate-500")
                                )}>
                                    {result === 'ok' ? <CheckCircle className="w-5 h-5" /> : 
                                    (account.status === 'expired' ? <RefreshCw className="w-5 h-5" /> : <RefreshCw className={cn("w-5 h-5", testing && "animate-spin")} />)}
                                </div>
                                <div>
                                    <p className={cn("text-sm font-bold", account.status === 'expired' ? "text-red-400" : "text-white")}>Autenticación</p>
                                    <p className={cn("text-[10px] uppercase font-black tracking-widest", account.status === 'expired' ? "text-red-500" : "text-slate-500")}>
                                        {result === 'ok' ? "Credenciales Válidas" : (account.status === 'expired' ? "Sesión Expirada" : "Pendiente")}
                                    </p>
                                </div>
                            </div>
                            <Button 
                                onClick={handleTest} 
                                disabled={testing}
                                variant="ghost" 
                                className={cn(
                                    "text-xs font-black uppercase tracking-widest gap-2",
                                    account.status === 'expired' ? "text-red-500 hover:bg-red-500/10" : "text-emerald-400 hover:bg-emerald-400/5"
                                )}
                            >
                                Probar ahora
                            </Button>
                        </div>

                        <div className="space-y-6">
                            <div className="flex items-center justify-between px-1 border-b border-white/5 pb-4">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Access Key ID</Label>
                                <p className="text-xs font-mono text-slate-400">{account.accessKeyId.substring(0, 16)}...</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <ProfileOverrideCard 
                accountId={account.id} 
                draftPath={draft.ssmPluginPath || ''}
                onDraftPathChange={(path) => setDraft(d => ({ ...d, ssmPluginPath: path }))}
                isEditing={isEditing}
            />
        </div>
    );
};
