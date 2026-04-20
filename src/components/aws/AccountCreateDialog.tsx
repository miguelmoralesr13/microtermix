import React, { useState } from 'react';
import { Plus, Lock, ClipboardPaste, RefreshCw } from 'lucide-react';
import { useAwsStore, AwsAccount } from '../../stores/awsStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '../ui/dialog';
import { parseAwsCredentialBlock } from './cwUtils';
import { CwCredentials, cwGetLogGroups } from '../../services/cloudwatchApi';

export const AccountCreateDialog: React.FC = () => {
    const { addAccount, setActiveAccount } = useAwsStore();
    const [isOpen, setIsOpen] = useState(false);
    const [isAutoProcessing, setIsAutoProcessing] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [draft, setDraft] = useState<Omit<AwsAccount, 'id'>>({
        name: '',
        accessKeyId: '',
        secretAccessKey: '',
        region: 'us-east-1'
    });

    const handleCreate = (data: Omit<AwsAccount, 'id'>) => {
        const id = addAccount(data);
        setActiveAccount(id);
        setIsOpen(false);
        setDraft({ name: '', accessKeyId: '', secretAccessKey: '', region: 'us-east-1' });
    };

    const handleTestAndCreate = async (data: Omit<AwsAccount, 'id'>) => {
        setIsAutoProcessing(true);
        try {
            await cwGetLogGroups(data as CwCredentials, '');
        } finally {
            handleCreate(data);
            setIsAutoProcessing(false);
        }
    };

    async function applyPaste(text: string) {
        const parsed = parseAwsCredentialBlock(text);
        if (Object.keys(parsed).length === 0) return;
        const newDraft = { ...draft, ...parsed } as Omit<AwsAccount, 'id'>;
        setPasteText('');
        handleTestAndCreate(newDraft);
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger
                render={
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full h-8 text-[10px] font-black uppercase tracking-widest text-microtermix-neon hover:bg-microtermix-neon/10 gap-1.5"
                    >
                        <Plus className="w-3 h-3" /> Nueva Cuenta
                    </Button>
                }
            />
            <DialogContent className="bg-card border-border max-w-xl p-0 overflow-hidden shadow-2xl">
                <Tabs defaultValue="manual" className="w-full flex flex-col">
                    <div className="p-6 border-b border-border space-y-4">
                        <DialogHeader>
                            <DialogTitle className="text-base font-black flex items-center gap-2 text-foreground">
                                <div className="p-1.5 bg-microtermix-neon/10 rounded-lg">
                                    <Lock className="w-4 h-4 text-microtermix-neon" />
                                </div>
                                Configurar Nueva Cuenta
                            </DialogTitle>
                        </DialogHeader>

                        <TabsList className="bg-muted border border-border h-9 p-1 w-full grid grid-cols-2">
                            <TabsTrigger
                                value="manual"
                                className="text-[10px] uppercase font-black py-1.5 data-active:bg-microtermix-neon data-active:text-microtermix-darker tracking-widest"
                            >
                                Entrada Manual
                            </TabsTrigger>
                            <TabsTrigger
                                value="paste"
                                className="text-[10px] uppercase font-black py-1.5 data-active:bg-microtermix-neon data-active:text-microtermix-darker tracking-widest"
                            >
                                Pegado Rápido
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="overflow-y-auto max-h-[65vh]">
                        {/* ── Manual tab ── */}
                        <TabsContent value="manual" className="p-6 space-y-4 m-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <Label className="text-[9px] uppercase text-muted-foreground font-black tracking-widest">Nombre de la Cuenta</Label>
                                    <Input
                                        placeholder="Ej: Producción, Desarrollo..."
                                        className="h-9 rounded-xl text-sm"
                                        value={draft.name}
                                        onChange={e => setDraft({ ...draft, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[9px] uppercase text-muted-foreground font-black tracking-widest">Región AWS</Label>
                                    <Input
                                        placeholder="us-east-1"
                                        className="h-9 rounded-xl text-sm"
                                        value={draft.region}
                                        onChange={e => setDraft({ ...draft, region: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-[9px] uppercase text-muted-foreground font-black tracking-widest">Access Key ID</Label>
                                        <Input
                                            placeholder="AKIA..."
                                            className="h-9 rounded-xl font-mono text-xs"
                                            value={draft.accessKeyId}
                                            onChange={e => setDraft({ ...draft, accessKeyId: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[9px] uppercase text-muted-foreground font-black tracking-widest">Secret Key</Label>
                                        <Input
                                            type="password"
                                            placeholder="••••••••"
                                            className="h-9 rounded-xl font-mono text-xs"
                                            value={draft.secretAccessKey}
                                            onChange={e => setDraft({ ...draft, secretAccessKey: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 pt-2">
                                <Button variant="ghost" onClick={() => setIsOpen(false)} className="flex-1 text-muted-foreground rounded-xl">
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={() => handleCreate(draft)}
                                    disabled={!draft.name || !draft.accessKeyId || !draft.secretAccessKey}
                                    className="flex-[2] bg-microtermix-neon text-microtermix-darker font-black uppercase tracking-widest text-xs h-10 rounded-xl"
                                >
                                    Crear Cuenta
                                </Button>
                            </div>
                        </TabsContent>

                        {/* ── Quick paste tab ── */}
                        <TabsContent value="paste" className="p-6 space-y-4 m-0 animate-in fade-in slide-in-from-bottom-2 duration-300 relative">
                            <div className="space-y-2">
                                <Label className="text-[9px] uppercase text-muted-foreground font-black tracking-widest flex items-center gap-2">
                                    <ClipboardPaste className="w-3 h-3 text-microtermix-neon" />
                                    Bloque de Credenciales
                                </Label>
                                <div className="relative">
                                    <textarea
                                        autoFocus
                                        value={pasteText}
                                        onChange={e => setPasteText(e.target.value)}
                                        onPaste={(e) => applyPaste(e.clipboardData.getData('text'))}
                                        placeholder={`[default]\naws_access_key_id = AKIA...\naws_secret_access_key = ...`}
                                        className="w-full bg-muted/50 border border-border rounded-2xl p-4 text-xs font-mono text-microtermix-neon placeholder:text-muted-foreground/40 min-h-[200px] focus:ring-2 focus:ring-microtermix-neon/30 outline-none transition-all resize-none"
                                    />
                                    {isAutoProcessing && (
                                        <div className="absolute inset-0 bg-card/90 backdrop-blur-md flex flex-col items-center justify-center rounded-2xl gap-3 border border-microtermix-neon/20 animate-in fade-in duration-300">
                                            <RefreshCw className="w-8 h-8 text-microtermix-neon animate-spin" />
                                            <p className="text-[10px] font-black text-microtermix-neon uppercase tracking-[0.2em]">Sincronizando...</p>
                                        </div>
                                    )}
                                </div>
                                <p className="text-[9px] text-muted-foreground italic leading-relaxed px-1">
                                    Pegá el contenido de tu archivo{' '}
                                    <code className="text-microtermix-neon font-mono">~/.aws/credentials</code>.
                                    Se detecta y guarda automáticamente al pegar.
                                </p>
                            </div>
                            <Button variant="ghost" onClick={() => setIsOpen(false)} className="w-full text-muted-foreground rounded-xl font-black uppercase text-[10px] tracking-widest">
                                Cerrar
                            </Button>
                        </TabsContent>
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};
