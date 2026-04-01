import React, { useState, useEffect } from 'react';
import { 
    User, ShieldCheck, Trash2, ChevronRight, RefreshCw
} from 'lucide-react';
import { useAwsStore } from '../../stores/awsStore';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';
import { AccountCreateDialog } from './AccountCreateDialog';
import { ssmCheckPlugin } from '../../services/cloudwatchApi';

export const AccountSidebar: React.FC = () => {
    const { 
        accounts, 
        activeAccountId, 
        setActiveAccount, 
        removeAccount,
        globalSettings,
        updateGlobalSettings
    } = useAwsStore();

    const [detectedPath, setDetectedPath] = useState<string | null>(null);
    const [isDetecting, setIsDetecting] = useState(false);

    const detectPlugin = async () => {
        setIsDetecting(true);
        try {
            const version = await ssmCheckPlugin(); 
            if (version && version.includes('(')) {
                const match = version.match(/\(([^)]+)\)/);
                if (match && match[1]) {
                    setDetectedPath(match[1]);
                    if (!globalSettings.ssmPluginPath) {
                        updateGlobalSettings({ ssmPluginPath: match[1] });
                    }
                }
            } else if (version) {
                 setDetectedPath("System PATH / Default");
            }
        } catch (e) {
            setDetectedPath(null);
        } finally {
            setIsDetecting(false);
        }
    };

    // Auto-detect on mount if not set
    useEffect(() => {
        if (!globalSettings.ssmPluginPath) {
            detectPlugin();
        }
    }, []);

    return (
        <div className="lg:col-span-4 space-y-6">
            <div className="flex items-center justify-between px-2">
                <Label className="text-[10px] uppercase font-black tracking-widest text-slate-500">Gestión de Perfiles ({accounts.length})</Label>
                <AccountCreateDialog />
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                {accounts.length === 0 ? (
                    <div className="p-10 border-2 border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center text-center space-y-4 bg-black/20">
                        <User className="w-8 h-8 text-slate-700" />
                        <p className="text-xs text-slate-500 font-medium">No hay cuentas.<br/>Comienza creando una nueva.</p>
                    </div>
                ) : (
                    accounts.map(acc => (
                        <div 
                            key={acc.id}
                            onClick={() => setActiveAccount(acc.id)}
                            className={cn(
                                "group relative p-4 rounded-2xl border transition-all duration-300 cursor-pointer flex items-center justify-between overflow-hidden",
                                activeAccountId === acc.id 
                                    ? (acc.status === 'expired' ? "bg-red-500/5 border-red-500/40 ring-1 ring-red-500/20" : "bg-microtermix-neon/10 border-microtermix-neon/40 shadow-2xl shadow-microtermix-neon/5 ring-1 ring-microtermix-neon/20")
                                    : (acc.status === 'expired' ? "bg-red-950/20 border-red-500/20 hover:border-red-500/40" : "bg-slate-900/40 border-white/5 hover:border-white/10 hover:bg-slate-900/80")
                            )}
                        >
                            <div className="flex items-center gap-4 relative z-10">
                                <div className={cn(
                                    "relative p-3 rounded-xl transition-all duration-500",
                                    activeAccountId === acc.id 
                                        ? (acc.status === 'expired' ? "bg-red-500 text-white shadow-lg shadow-red-500/30" : "bg-microtermix-neon text-microtermix-darker shadow-lg shadow-microtermix-neon/30 rotate-3 scale-110")
                                        : (acc.status === 'expired' ? "bg-red-900/40 text-red-400" : "bg-slate-800/80 text-slate-500 group-hover:text-slate-300 group-hover:scale-105")
                                )}>
                                    <ShieldCheck className="w-5 h-5" />
                                    {activeAccountId === acc.id && (
                                        <div className={cn(
                                            "absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-950 animate-pulse shadow-sm",
                                            acc.status === 'expired' ? "bg-red-400" : "bg-emerald-400"
                                        )} />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={cn(
                                        "text-[14px] font-black truncate leading-tight transition-colors tracking-tight",
                                        activeAccountId === acc.id ? "text-white" : "text-slate-400 group-hover:text-slate-200",
                                        acc.status === 'expired' && "text-red-400"
                                    )}>{acc.name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="outline" className={cn(
                                            "text-[9px] font-black border-white/10 py-0 px-1.5 h-4 bg-black/40 text-slate-500 uppercase tracking-widest",
                                            acc.status === 'expired' && "border-red-500/30 text-red-500"
                                        )}>
                                            {acc.status === 'expired' ? 'SESIÓN EXPIRADA' : acc.region}
                                        </Badge>
                                        <p className="text-[10px] text-slate-600 font-mono tracking-tighter opacity-80 uppercase">
                                            key: {acc.accessKeyId.slice(-4)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 relative z-10">
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm(`¿Eliminar cuenta "${acc.name}"?`)) removeAccount(acc.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-red-400 transition-all rounded-xl hover:bg-red-400/10 active:scale-90"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                <ChevronRight className={cn(
                                    "w-5 h-5 transition-all duration-300",
                                    activeAccountId === acc.id ? "text-microtermix-neon translate-x-1" : "text-slate-800 group-hover:text-slate-600"
                                )} />
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Global System Settings */}
            <div className="space-y-4 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between px-2">
                    <Label className="text-[10px] uppercase font-black tracking-widest text-slate-500">Configuración Global</Label>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={detectPlugin}
                        disabled={isDetecting}
                        className="h-6 text-[9px] font-black uppercase tracking-widest text-microtermix-neon hover:bg-microtermix-neon/5 focus:ring-0"
                    >
                        <RefreshCw className={cn("w-3 h-3 mr-1", isDetecting && "animate-spin")} /> Detectar
                    </Button>
                </div>
                
                <div className="p-4 bg-slate-900/40 border border-white/5 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">SM Plugin (Sistema)</Label>
                        {detectedPath ? (
                            <Badge variant="outline" className="text-[8px] bg-emerald-400/5 text-emerald-400 border-emerald-400/20 py-0 h-4">DETECTADO</Badge>
                        ) : (
                            <Badge variant="outline" className="text-[8px] bg-amber-400/5 text-amber-400 border-amber-400/20 py-0 h-4">SISTEMA</Badge>
                        )}
                    </div>
                    <Input 
                        value={globalSettings.ssmPluginPath || ''} 
                        onChange={e => updateGlobalSettings({ ssmPluginPath: e.target.value })}
                        placeholder="Ruta absoluta (ej: /usr/local/bin/...)"
                        className="bg-black/40 border-white/5 h-10 rounded-xl font-mono text-[10px] text-slate-400 focus:text-white"
                    />
                    {detectedPath && (
                        <p className="text-[9px] text-slate-600 italic px-1 truncate">Ubicación: {detectedPath}</p>
                    )}
                </div>
            </div>
        </div>
    );
};
