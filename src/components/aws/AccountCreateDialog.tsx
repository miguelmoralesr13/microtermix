import React, { useState } from 'react';
import { 
    Plus, Lock, ClipboardPaste, RefreshCw 
} from 'lucide-react';
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
        // Reset draft
        setDraft({ name: '', accessKeyId: '', secretAccessKey: '', region: 'us-east-1' });
    };

    const handleTestAndCreate = async (data: Omit<AwsAccount, 'id'>) => {
        setIsAutoProcessing(true);
        try {
            await cwGetLogGroups(data as CwCredentials, '');
            handleCreate(data);
        } catch (e) {
            // Even if test fails, we allow creation? 
            // For now, let's just create as requested
            handleCreate(data);
        } finally {
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
                    <Button variant="ghost" size="sm" className="h-7 text-[10px] font-black uppercase tracking-widest text-microtermix-neon hover:bg-microtermix-neon/10 gap-1.5 focus:ring-0">
                        <Plus className="w-3 h-3" /> Añadir
                    </Button>
                }
            />
            <DialogContent className="bg-[#020617] border-white/10 text-white max-w-xl p-0 overflow-hidden shadow-2xl">
                <Tabs defaultValue="manual" className="w-full h-full flex flex-col">
                    <div className="p-6 border-b border-white/5 space-y-4">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold flex items-center gap-2">
                                <div className="p-1.5 bg-microtermix-neon/10 rounded-lg">
                                    <Lock className="w-5 h-5 text-microtermix-neon" />
                                </div>
                                Configurar Nueva Cuenta
                            </DialogTitle>
                        </DialogHeader>
                        
                        <TabsList className="bg-black/40 border border-white/5 h-10 p-1 w-full grid grid-cols-2">
                            <TabsTrigger value="manual" className="text-[10px] uppercase font-black py-1.5 data-active:bg-microtermix-neon data-active:text-microtermix-darker transition-all tracking-widest">
                                Entrada Manual
                            </TabsTrigger>
                            <TabsTrigger value="paste" className="text-[10px] uppercase font-black py-1.5 data-active:bg-microtermix-neon data-active:text-microtermix-darker transition-all tracking-widest">
                                Pegado Rápido
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="flex-1 overflow-y-auto max-h-[70vh]">
                        <TabsContent value="manual" className="p-6 space-y-5 m-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase text-slate-500 font-black tracking-widest">Nombre de la Cuenta</Label>
                                    <Input 
                                        placeholder="Ej: Producción, Desarrollo..." 
                                        className="bg-black/60 border-white/5 focus-visible:ring-microtermix-neon/50 h-10 rounded-xl"
                                        value={draft.name}
                                        onChange={e => setDraft({...draft, name: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase text-slate-500 font-black tracking-widest">Región AWS</Label>
                                    <Input 
                                        placeholder="us-east-1" 
                                        className="bg-black/60 border-white/5 focus-visible:ring-microtermix-neon/50 h-10 rounded-xl"
                                        value={draft.region}
                                        onChange={e => setDraft({...draft, region: e.target.value})}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] uppercase text-slate-500 font-black tracking-widest">Access Key ID</Label>
                                        <Input 
                                            placeholder="AKIA..." 
                                            className="bg-black/60 border-white/5 font-mono text-xs focus-visible:ring-microtermix-neon/50 h-10 rounded-xl"
                                            value={draft.accessKeyId}
                                            onChange={e => setDraft({...draft, accessKeyId: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] uppercase text-slate-500 font-black tracking-widest">Secret Key</Label>
                                        <Input 
                                            type="password"
                                            placeholder="••••••••" 
                                            className="bg-black/60 border-white/5 font-mono text-xs focus-visible:ring-microtermix-neon/50 h-10 rounded-xl"
                                            value={draft.secretAccessKey}
                                            onChange={e => setDraft({...draft, secretAccessKey: e.target.value})}
                                        />
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-3 pt-6">
                                <Button variant="ghost" onClick={() => setIsOpen(false)} className="flex-1 text-slate-400 hover:text-white rounded-xl">Cancelar</Button>
                                <Button onClick={() => handleCreate(draft)} className="flex-[2] bg-microtermix-neon text-microtermix-darker font-black uppercase tracking-widest text-xs h-11 rounded-xl shadow-lg shadow-microtermix-neon/10 hover:scale-[1.02] active:scale-95 transition-all">
                                    Crear Cuenta
                                </Button>
                            </div>
                        </TabsContent>

                        <TabsContent value="paste" className="p-6 space-y-5 m-0 animate-in fade-in slide-in-from-bottom-2 duration-300 relative">
                            <div className="space-y-3">
                                <Label className="text-[10px] uppercase text-slate-500 font-black tracking-widest flex items-center gap-2">
                                    <ClipboardPaste className="w-3 h-3 text-microtermix-neon" /> Bloque de Credenciales
                                </Label>
                                <div className="relative group">
                                    <textarea
                                        autoFocus
                                        value={pasteText}
                                        onChange={e => setPasteText(e.target.value)}
                                        onPaste={(e) => applyPaste(e.clipboardData.getData('text'))}
                                        placeholder={`[default]\naws_access_key_id = AKIA...\naws_secret_access_key = ...`}
                                        className="w-full bg-black/60 border border-white/10 rounded-2xl p-4 text-xs font-mono text-microtermix-neon placeholder:text-slate-800 min-h-[220px] focus:ring-2 focus:ring-microtermix-neon/30 outline-none scrollbar-hide ring-offset-0 transition-all font-mono"
                                    />
                                    {isAutoProcessing && (
                                        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center rounded-2xl gap-4 border border-microtermix-neon/20 animate-in fade-in duration-300">
                                            <RefreshCw className="w-12 h-12 text-microtermix-neon animate-spin" />
                                            <p className="text-[10px] font-black text-microtermix-neon animate-pulse uppercase tracking-[0.2em]">Sincronizando...</p>
                                        </div>
                                    )}
                                </div>
                                <div className="p-3 bg-microtermix-neon/5 rounded-xl border border-microtermix-neon/10 text-[10px] text-slate-400 italic leading-relaxed">
                                    Pega el contenido de tu archivo <code className="text-microtermix-neon font-mono">~/.aws/credentials</code>.
                                </div>
                            </div>
                            <div className="pt-2">
                                <Button variant="ghost" onClick={() => setIsOpen(false)} className="w-full text-slate-500 hover:text-white rounded-xl uppercase font-black text-[10px] tracking-widest">
                                    Cerrar
                                </Button>
                            </div>
                        </TabsContent>
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};
