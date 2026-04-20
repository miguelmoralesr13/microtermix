import React, { useState, useEffect } from 'react';
import { Edit2, RefreshCw, CheckCircle, Eye, EyeOff, ClipboardPaste } from 'lucide-react';
import { useAwsStore, AwsAccount } from '../../stores/awsStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
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
    const [showSecret, setShowSecret] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [isAutoProcessing, setIsAutoProcessing] = useState(false);

    useEffect(() => {
        if (!isEditing) setDraft({ ...account });
    }, [account.id, isEditing, account]);

    const handleSave = (customDraft?: Omit<AwsAccount, 'id'>) => {
        updateAccount(account.id, customDraft || draft);
        setIsEditing(false);
        onSaved();
    };

    const applyPaste = async (text: string) => {
        const parsed = parseAwsCredentialBlock(text);
        if (Object.keys(parsed).length === 0) return;
        const newDraft = { ...draft, ...parsed } as Omit<AwsAccount, 'id'>;
        setDraft(newDraft);
        setPasteText('');
        setIsAutoProcessing(true);
        try {
            await cwGetLogGroups(newDraft as CwCredentials, '');
            setAccountStatus(account.id, 'valid');
        } catch { /* allow save even if test fails */ }
        handleSave(newDraft);
        setIsAutoProcessing(false);
    };

    const handleTest = async () => {
        setTesting(true);
        setResult(null);
        try {
            await cwGetLogGroups(draft as CwCredentials, '');
            setResult('ok');
            setAccountStatus(account.id, 'valid');
        } catch {
            setResult('error');
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300 max-w-xl">
            {/* Account title + actions */}
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h2 className="text-base font-black text-foreground tracking-tight flex items-center gap-2">
                        {account.name}
                        <Badge variant="outline" className={cn(
                            "text-[9px] uppercase font-black tracking-widest",
                            account.status === 'expired'
                                ? "border-red-500 text-red-500 bg-red-500/10"
                                : "border-border text-muted-foreground"
                        )}>
                            {account.status === 'expired' ? 'Sesión Expirada' : account.region}
                        </Badge>
                    </h2>
                    <p className="text-[9px] text-muted-foreground font-mono">ID: {account.id}</p>
                </div>
                <Button
                    variant={isEditing ? "ghost" : "outline"}
                    size="sm"
                    onClick={() => setIsEditing(!isEditing)}
                    className="h-8 gap-2"
                >
                    {isEditing ? "Cancelar" : <><Edit2 className="w-3.5 h-3.5" /> Editar</>}
                </Button>
            </div>

            {/* Main card */}
            <div className={cn(
                "p-5 rounded-2xl border transition-all bg-card",
                isEditing
                    ? "border-microtermix-neon/20 ring-1 ring-microtermix-neon/10"
                    : account.status === 'expired'
                        ? "border-red-500/30 ring-1 ring-red-500/10"
                        : "border-border"
            )}>
                {isEditing ? (
                    <Tabs defaultValue="manual" className="w-full flex-col">
                        <TabsList className="bg-muted border border-border h-8 p-1 w-full grid grid-cols-2 mb-4">
                            <TabsTrigger value="manual" className="text-[9px] uppercase font-black tracking-widest data-active:bg-microtermix-neon data-active:text-microtermix-darker">
                                Manual
                            </TabsTrigger>
                            <TabsTrigger value="paste" className="text-[9px] uppercase font-black tracking-widest data-active:bg-microtermix-neon data-active:text-microtermix-darker gap-1.5">
                                <ClipboardPaste className="w-3 h-3" /> Pegado Rápido
                            </TabsTrigger>
                        </TabsList>

                        {/* ── Manual ── */}
                        <TabsContent value="manual" className="m-0 space-y-4 animate-in fade-in duration-200">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Región</Label>
                                    <Input value={draft.region} onChange={e => setDraft({ ...draft, region: e.target.value })} className="h-9 rounded-xl text-xs" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Session Token</Label>
                                    <Input placeholder="Opcional" value={draft.sessionToken || ''} onChange={e => setDraft({ ...draft, sessionToken: e.target.value })} className="h-9 rounded-xl text-xs" />
                                </div>
                                <div className="col-span-2 space-y-1.5">
                                    <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Access Key ID</Label>
                                    <Input value={draft.accessKeyId} onChange={e => setDraft({ ...draft, accessKeyId: e.target.value })} className="h-9 rounded-xl font-mono text-xs" />
                                </div>
                                <div className="col-span-2 space-y-1.5">
                                    <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Secret Access Key</Label>
                                    <div className="relative">
                                        <Input
                                            type={showSecret ? "text" : "password"}
                                            value={draft.secretAccessKey}
                                            onChange={e => setDraft({ ...draft, secretAccessKey: e.target.value })}
                                            className="h-9 rounded-xl font-mono text-xs pr-10"
                                        />
                                        <button
                                            onClick={() => setShowSecret(!showSecret)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <Button
                                onClick={() => handleSave()}
                                className="w-full bg-microtermix-neon text-microtermix-darker font-black uppercase tracking-widest h-10 rounded-xl"
                            >
                                Guardar
                            </Button>
                        </TabsContent>

                        {/* ── Quick paste ── */}
                        <TabsContent value="paste" className="m-0 space-y-3 animate-in fade-in duration-200 relative">
                            <div className="relative">
                                <textarea
                                    autoFocus
                                    value={pasteText}
                                    onChange={e => setPasteText(e.target.value)}
                                    onPaste={(e) => applyPaste(e.clipboardData.getData('text'))}
                                    placeholder={`[default]\naws_access_key_id = AKIA...\naws_secret_access_key = ...`}
                                    className="w-full bg-muted/50 border border-border rounded-2xl p-4 text-xs font-mono text-microtermix-neon placeholder:text-muted-foreground/40 min-h-[160px] focus:ring-2 focus:ring-microtermix-neon/30 outline-none transition-all resize-none"
                                />
                                {isAutoProcessing && (
                                    <div className="absolute inset-0 bg-card/90 backdrop-blur-md flex flex-col items-center justify-center rounded-2xl gap-3 border border-microtermix-neon/20 animate-in fade-in duration-300">
                                        <RefreshCw className="w-7 h-7 text-microtermix-neon animate-spin" />
                                        <p className="text-[9px] font-black text-microtermix-neon uppercase tracking-[0.2em]">Sincronizando...</p>
                                    </div>
                                )}
                            </div>
                            <p className="text-[9px] text-muted-foreground italic px-1">
                                Pegá el bloque de <code className="text-microtermix-neon font-mono">~/.aws/credentials</code> — se guarda automáticamente.
                            </p>
                        </TabsContent>
                    </Tabs>
                ) : (
                    <div className="space-y-4">
                        {/* Auth status row */}
                        <div className={cn(
                            "flex items-center justify-between p-4 bg-muted/30 rounded-xl border transition-all",
                            account.status === 'expired' ? "border-red-500/30 bg-red-500/5" : "border-border"
                        )}>
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "p-2 rounded-lg",
                                    result === 'ok'
                                        ? "bg-emerald-500/10 text-emerald-400"
                                        : account.status === 'expired'
                                            ? "bg-red-500/10 text-red-500"
                                            : "bg-muted text-muted-foreground"
                                )}>
                                    {result === 'ok'
                                        ? <CheckCircle className="w-4 h-4" />
                                        : <RefreshCw className={cn("w-4 h-4", testing && "animate-spin")} />
                                    }
                                </div>
                                <div>
                                    <p className={cn(
                                        "text-xs font-bold",
                                        account.status === 'expired' ? "text-red-400" : "text-foreground"
                                    )}>Autenticación</p>
                                    <p className={cn(
                                        "text-[9px] uppercase font-black tracking-widest",
                                        account.status === 'expired' ? "text-red-500" : "text-muted-foreground"
                                    )}>
                                        {result === 'ok' ? "Credenciales Válidas" : account.status === 'expired' ? "Sesión Expirada" : "Pendiente"}
                                    </p>
                                </div>
                            </div>
                            <Button
                                onClick={handleTest}
                                disabled={testing}
                                variant="ghost"
                                size="sm"
                                className={cn(
                                    "text-[10px] font-black uppercase tracking-widest h-8",
                                    account.status === 'expired' ? "text-red-500 hover:bg-red-500/10" : "text-emerald-400 hover:bg-emerald-400/5"
                                )}
                            >
                                Probar
                            </Button>
                        </div>

                        {/* Credentials summary */}
                        <div className="space-y-2 px-1">
                            <div className="flex items-center justify-between py-2 border-b border-border">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Access Key ID</Label>
                                <p className="text-[11px] font-mono text-foreground">{account.accessKeyId.substring(0, 16)}...</p>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Región</Label>
                                <p className="text-[11px] font-mono text-foreground">{account.region}</p>
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
