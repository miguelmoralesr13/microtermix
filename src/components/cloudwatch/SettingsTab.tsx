import { useState, useEffect } from 'react';
import { 
    Settings, RefreshCw, CheckCircle, AlertCircle, 
    ClipboardPaste, ShieldCheck, HardDrive, Globe, 
    ExternalLink, Info, Edit2, Lock, Eye, EyeOff,
    Copy, Terminal as TerminalIcon, Cpu, Apple
} from 'lucide-react';
import {
    CwCredentials,
    cwGetLogGroups,
    ssmCheckPlugin
} from '../../services/cloudwatchApi';
import { parseAwsCredentialBlock, detectOs, OsTab } from './cwUtils';
import { useAwsStore } from '../../stores/awsStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { cn } from '../../lib/utils';

interface SettingsTabProps {
    onSaved: () => void;
}

export function SettingsTab({ onSaved }: SettingsTabProps) {
    const storedCredentials = useAwsStore(s => s.credentials);
    const [isEditing, setIsEditing] = useState(!storedCredentials?.accessKeyId);
    
    const [draft, setDraft] = useState<CwCredentials>(
        () => storedCredentials ?? { accessKeyId: '', secretAccessKey: '', region: 'us-east-1' }
    );
    
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState<'ok' | 'error' | null>(null);
    const [errMsg, setErrMsg] = useState('');
    const [showPaste, setShowPaste] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [osTab, setOsTab] = useState<OsTab>(detectOs);
    const [showSecret, setShowSecret] = useState(false);
    const [isAutoProcessing, setIsAutoProcessing] = useState(false);

    // Update draft when stored credentials change (if not editing)
    useEffect(() => {
        if (!isEditing && storedCredentials) {
            setDraft(storedCredentials);
        }
    }, [storedCredentials, isEditing]);

    const handleSave = (customDraft?: CwCredentials) => {
        const toSave = customDraft || draft;
        useAwsStore.getState().setCredentials(toSave);
        setIsEditing(false);
        onSaved();
    };

    const handleTest = async (credentialsToTest?: CwCredentials) => {
        const target = credentialsToTest || draft;
        setTesting(true);
        setResult(null);
        try {
            await cwGetLogGroups(target, '');
            // We only check plugin if a path is provided or if we want to autodetect
            if (target.ssmPluginPath) {
                await ssmCheckPlugin(target.ssmPluginPath);
            }
            setResult('ok');
            return true;
        } catch (e: any) {
            setResult('error');
            setErrMsg(e?.message ?? String(e));
            return false;
        } finally {
            setTesting(false);
        }
    };

    async function applyPaste(text: string) {
        const parsed = parseAwsCredentialBlock(text);
        if (Object.keys(parsed).length === 0) return;
        
        const newDraft = { ...draft, ...parsed };
        setDraft(newDraft);
        setPasteText('');
        setShowPaste(false);
        
        // Auto-process: Test & Save
        setIsAutoProcessing(true);
        const isValid = await handleTest(newDraft);
        if (isValid) {
            handleSave(newDraft);
        }
        setIsAutoProcessing(false);
    }

    const isConfigured = !!(storedCredentials?.accessKeyId && storedCredentials?.secretAccessKey);

    return (
        <div className="max-w-5xl mx-auto p-8 space-y-8 animate-in fade-in duration-500">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-microtermix-neon/10 rounded-xl">
                            <Settings className="w-8 h-8 text-microtermix-neon" />
                        </div>
                        AWS Hub Configuration
                    </h1>
                    <p className="text-slate-400 mt-2">Gestiona tus credenciales y conectividad con la nube de Amazon.</p>
                </div>
                
                <div className="flex items-center gap-3">
                    <Badge variant={isConfigured ? "outline" : "secondary"} className={cn(
                        "px-3 py-1 text-xs font-semibold uppercase tracking-wider",
                        isConfigured ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/5" : "bg-slate-800 text-slate-400"
                    )}>
                        {isConfigured ? 'Status: Configurado' : 'Status: Sin configurar'}
                    </Badge>
                    {result === 'ok' && (
                        <Badge className="bg-emerald-500 text-emerald-950 px-3 py-1 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Online
                        </Badge>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column: Credentials */}
                <div className="lg:col-span-7 space-y-6">
                    <Card className="border-white/5 bg-slate-900/40 backdrop-blur-sm shadow-xl">
                        <CardHeader className="flex flex-row items-center justify-between pb-4">
                            <div className="space-y-1">
                                <CardTitle className="text-xl font-semibold flex items-center gap-2">
                                    <Lock className="w-5 h-5 text-microtermix-neon" /> Credenciales de Acceso
                                </CardTitle>
                                <CardDescription>Variables de entorno para autenticación en AWS.</CardDescription>
                            </div>
                            {!isEditing && isConfigured && (
                                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="gap-2 border-white/10 hover:bg-white/5">
                                    <Edit2 className="w-4 h-4" /> Editar
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {isEditing ? (
                                <>
                                    <div className="flex justify-between items-center mb-2">
                                        <p className="text-xs text-slate-500 italic">Completa los campos o usa el pegado rápido.</p>
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => setShowPaste(!showPaste)}
                                            className={cn("gap-2 text-xs h-7", showPaste ? "text-microtermix-neon bg-white/5" : "text-slate-400")}
                                        >
                                            <ClipboardPaste className="w-4 h-4" />
                                            Pegado Rápido
                                        </Button>
                                    </div>

                                    {showPaste && (
                                        <div className="bg-microtermix-neon/5 border border-microtermix-neon/20 rounded-xl p-4 space-y-4 animate-in slide-in-from-top-2 duration-300">
                                            <div className="flex items-start gap-3">
                                                <div className="p-2 bg-microtermix-neon/10 rounded-lg">
                                                    <ClipboardPaste className="w-5 h-5 text-microtermix-neon" />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-semibold text-white">Modo Auto-Configuración</p>
                                                    <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                                                        Pega el bloque de credenciales aquí. Validaremos y guardaremos automáticamente.
                                                    </p>
                                                </div>
                                            </div>
                                            
                                            <div className="relative">
                                                <textarea
                                                    autoFocus
                                                    value={pasteText}
                                                    onChange={e => setPasteText(e.target.value)}
                                                    onPaste={(e) => {
                                                        const text = e.clipboardData.getData('text');
                                                        applyPaste(text);
                                                    }}
                                                    placeholder={`aws_access_key_id=ASIA...\naws_secret_access_key=...\naws_session_token=...`}
                                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono text-microtermix-neon placeholder:text-slate-700 min-h-[140px] focus:ring-1 focus:ring-microtermix-neon outline-none resize-none"
                                                />
                                                {isAutoProcessing && (
                                                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-lg gap-3">
                                                        <RefreshCw className="w-8 h-8 text-microtermix-neon animate-spin" />
                                                        <p className="text-xs font-bold text-microtermix-neon animate-pulse uppercase tracking-widest">Validando y Guardando...</p>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="flex gap-2 justify-end">
                                                <Button variant="ghost" size="sm" onClick={() => setShowPaste(false)} className="text-slate-500">Cerrar</Button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs uppercase tracking-widest text-slate-500">Región</Label>
                                            <Input 
                                                value={draft.region} 
                                                onChange={e => setDraft({...draft, region: e.target.value})}
                                                placeholder="us-east-1"
                                                className="bg-slate-950/50 border-white/5"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs uppercase tracking-widest text-slate-500">Access Key ID</Label>
                                            <Input 
                                                value={draft.accessKeyId} 
                                                onChange={e => setDraft({...draft, accessKeyId: e.target.value})}
                                                placeholder="AKIA..."
                                                className="bg-slate-950/50 border-white/5 font-mono"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs uppercase tracking-widest text-slate-500">Secret Access Key</Label>
                                        <div className="relative">
                                            <Input 
                                                type={showSecret ? "text" : "password"}
                                                value={draft.secretAccessKey} 
                                                onChange={e => setDraft({...draft, secretAccessKey: e.target.value})}
                                                placeholder="••••••••••••••••••••••••••••••••"
                                                className="bg-slate-950/50 border-white/5 font-mono pr-10"
                                            />
                                            <button 
                                                onClick={() => setShowSecret(!showSecret)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                            >
                                                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs uppercase tracking-widest text-slate-500">Session Token (Opcional)</Label>
                                        <Input 
                                            value={draft.sessionToken || ''} 
                                            onChange={e => setDraft({...draft, sessionToken: e.target.value})}
                                            placeholder="Token para sesiones temporales (STS)"
                                            className="bg-slate-950/50 border-white/5 font-mono"
                                        />
                                    </div>

                                    <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                                        <Button onClick={() => handleSave()} className="bg-microtermix-accent hover:bg-microtermix-accent/80 text-white font-bold px-8">
                                            Guardar Configuración
                                        </Button>
                                        {isConfigured && (
                                            <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancelar</Button>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-8">
                                        <div className="space-y-1">
                                            <p className="text-xs text-slate-500 uppercase tracking-widest">Región activa</p>
                                            <p className="text-lg font-mono text-white flex items-center gap-2">
                                                <Globe className="w-4 h-4 text-microtermix-neon" /> {storedCredentials?.region}
                                            </p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs text-slate-500 uppercase tracking-widest">Access Key ID</p>
                                            <p className="text-lg font-mono text-white truncate">{storedCredentials?.accessKeyId.substring(0, 8)}...{storedCredentials?.accessKeyId.slice(-4)}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <ShieldCheck className="w-6 h-6 text-emerald-500" />
                                            <div>
                                                <p className="text-sm font-medium text-white">Conexión Segura Establecida</p>
                                                <p className="text-xs text-slate-400">Microtermix está usando tus credenciales locales de forma privada.</p>
                                            </div>
                                        </div>
                                        <Button 
                                            onClick={() => handleTest()} 
                                            disabled={testing}
                                            variant="outline" 
                                            size="sm"
                                            className="gap-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                                        >
                                            {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                            Verificar
                                        </Button>
                                    </div>

                                    {result === 'error' && (
                                        <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl space-y-2">
                                            <div className="flex items-center gap-2 text-red-400 font-medium">
                                                <AlertCircle className="w-4 h-4" /> Fallo en la verificación
                                            </div>
                                            <p className="text-xs text-red-300/70 leading-relaxed font-mono">{errMsg}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="border-white/5 bg-slate-900/40 backdrop-blur-sm">
                        <CardHeader>
                            <CardTitle className="text-lg font-semibold flex items-center gap-2 text-slate-200">
                                <HardDrive className="w-5 h-5 text-microtermix-neon" /> Session Manager Plugin
                            </CardTitle>
                            <CardDescription>Necesario para abrir terminales SSM directas a instancias EC2.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-widest text-slate-500">Ruta Ejecutable (Opcional)</Label>
                                <Input 
                                    value={draft.ssmPluginPath || ''} 
                                    onChange={e => setDraft({...draft, ssmPluginPath: e.target.value})}
                                    placeholder="Auto-detectar o ruta absoluta al binario"
                                    className="bg-slate-950/50 border-white/5 font-mono text-xs"
                                />
                                <p className="text-[10px] text-slate-500 italic">Si se deja vacío, Microtermix buscará el plugin en los paths por defecto del sistema.</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Instructions */}
                <div className="lg:col-span-5">
                    <div className="h-full bg-slate-900/20 rounded-3xl border border-white/5 flex flex-col overflow-hidden">
                        <Tabs defaultValue={osTab} onValueChange={(v) => setOsTab(v as OsTab)} className="flex flex-col h-full">
                            <div className="flex justify-center p-4 bg-slate-900/40 border-b border-white/5">
                                <TabsList className="bg-slate-950/50 p-1 rounded-full border border-white/10 w-fit">
                                    <TabsTrigger value="windows" className="rounded-full px-4 py-1.5 gap-2 data-active:bg-microtermix-neon data-active:text-microtermix-darker transition-all text-xs">
                                        <Cpu className="w-3.5 h-3.5" /> Win
                                    </TabsTrigger>
                                    <TabsTrigger value="linux" className="rounded-full px-4 py-1.5 gap-2 data-active:bg-microtermix-neon data-active:text-microtermix-darker transition-all text-xs">
                                        <TerminalIcon className="w-3.5 h-3.5" /> Linux
                                    </TabsTrigger>
                                    <TabsTrigger value="macos" className="rounded-full px-4 py-1.5 gap-2 data-active:bg-microtermix-neon data-active:text-microtermix-darker transition-all text-xs">
                                        <Apple className="w-3.5 h-3.5" /> Mac
                                    </TabsTrigger>
                                </TabsList>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                <div className="flex items-center gap-3 text-slate-500/50">
                                    <div className="h-px flex-1 bg-current" />
                                    <span className="text-[9px] uppercase tracking-[0.3em] font-black text-slate-500">Setup Guide</span>
                                    <div className="h-px flex-1 bg-current" />
                                </div>

                                <TabsContent value="windows" className="space-y-6 m-0 animate-in fade-in zoom-in-95 duration-300 outline-none">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-microtermix-neon" />
                                                Instalador MSI
                                            </p>
                                            <a 
                                                href="https://s3.amazonaws.com/session-manager-downloads/plugin/latest/windows/SessionManagerPluginSetup.exe"
                                                target="_blank"
                                                className="flex items-center justify-between p-3 bg-slate-950 border border-white/5 rounded-2xl text-xs text-microtermix-neon hover:bg-microtermix-neon/10 transition-all group"
                                            >
                                                <span className="font-mono truncate mr-2 text-[11px]">SessionManagerPlugin.exe</span>
                                                <ExternalLink className="w-3 h-3 shrink-0" />
                                            </a>
                                        </div>

                                        <div className="space-y-2">
                                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-microtermix-neon" />
                                                Vía Winget
                                            </p>
                                            <div className="relative group overflow-hidden">
                                                <code className="block bg-black/40 p-3 pr-10 rounded-2xl text-[10px] text-emerald-400 font-mono border border-white/5 leading-relaxed">
                                                    winget install Amazon.SessionManagerPlugin
                                                </code>
                                                <Button 
                                                    variant="ghost" size="icon-xs" 
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                                                    onClick={() => navigator.clipboard.writeText('winget install Amazon.SessionManagerPlugin')}
                                                >
                                                    <Copy className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="linux" className="space-y-6 m-0 animate-in fade-in zoom-in-95 duration-300 outline-none">
                                    <div className="space-y-5">
                                        <div className="space-y-2">
                                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">Debian / Ubuntu</p>
                                            <div className="relative group">
                                                <code className="block bg-black/40 p-3 pr-10 rounded-2xl text-[10px] text-emerald-400 font-mono border border-white/5 whitespace-pre-wrap leading-relaxed">
                                                    curl "..." -o "smp.deb"<br/>
                                                    sudo dpkg -i smp.deb
                                                </code>
                                                <Button 
                                                    variant="ghost" size="icon-xs" 
                                                    className="absolute right-2 top-3 text-slate-500 hover:text-white"
                                                    onClick={() => navigator.clipboard.writeText('curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb" -o "smp.deb" && sudo dpkg -i smp.deb')}
                                                >
                                                    <Copy className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">RHEL / Fedora</p>
                                            <div className="relative group">
                                                <code className="block bg-black/40 p-3 pr-10 rounded-2xl text-[10px] text-emerald-400 font-mono border border-white/5">
                                                    sudo yum install -y smp.rpm
                                                </code>
                                                <Button 
                                                    variant="ghost" size="icon-xs" 
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                                                    onClick={() => navigator.clipboard.writeText('sudo yum install -y https://s3.amazonaws.com/session-manager-downloads/plugin/latest/linux_64bit/session-manager-plugin.rpm')}
                                                >
                                                    <Copy className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="macos" className="space-y-6 m-0 animate-in fade-in zoom-in-95 duration-300 outline-none">
                                    <div className="space-y-5">
                                        <div className="space-y-2">
                                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">Homebrew</p>
                                            <div className="relative group">
                                                <code className="block bg-black/40 p-3 pr-10 rounded-2xl text-[10px] text-emerald-400 font-mono border border-white/5">
                                                    brew install --cask session-manager-plugin
                                                </code>
                                                <Button 
                                                    variant="ghost" size="icon-xs" 
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                                                    onClick={() => navigator.clipboard.writeText('brew install --cask session-manager-plugin')}
                                                >
                                                    <Copy className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="p-4 bg-slate-950/50 rounded-2xl border border-white/5 text-[10px] text-slate-500 italic leading-relaxed">
                                            Para instalación manual, descarga el bundle ZIP desde la web oficial de AWS y ejecuta el instalador binario.
                                        </div>
                                    </div>
                                </TabsContent>

                                <div className="pt-4 mt-auto">
                                    <div className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10 flex gap-3">
                                        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                                        <p className="text-[10px] text-blue-300/60 leading-relaxed">
                                            El plugin habilita túneles seguros sin abrir puertos 22 públicos.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </Tabs>
                    </div>
                </div>
            </div>
        </div>
    );
}
