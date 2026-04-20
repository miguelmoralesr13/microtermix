import React, { useState, useEffect } from 'react';
import { User, ShieldCheck, Trash2, ChevronRight, RefreshCw } from 'lucide-react';
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
        } catch {
            setDetectedPath(null);
        } finally {
            setIsDetecting(false);
        }
    };

    useEffect(() => {
        if (!globalSettings.ssmPluginPath) {
            detectPlugin();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="w-64 shrink-0 border-r border-border flex flex-col bg-card/50">
            {/* Profiles header */}
            <div className="p-4 border-b border-border">
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                    Perfiles ({accounts.length})
                </p>
            </div>

            {/* Account list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {accounts.length === 0 ? (
                    <div className="p-6 flex flex-col items-center justify-center text-center gap-3">
                        <User className="w-6 h-6 text-muted-foreground/30" />
                        <p className="text-xs text-muted-foreground">Sin cuentas. Creá una nueva.</p>
                    </div>
                ) : (
                    accounts.map(acc => (
                        <div
                            key={acc.id}
                            onClick={() => setActiveAccount(acc.id)}
                            className={cn(
                                "group relative px-3 py-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between",
                                activeAccountId === acc.id
                                    ? acc.status === 'expired'
                                        ? "bg-red-500/5 border-red-500/40 ring-1 ring-red-500/20"
                                        : "bg-microtermix-neon/10 border-microtermix-neon/30 ring-1 ring-microtermix-neon/10"
                                    : acc.status === 'expired'
                                        ? "border-red-500/20 hover:border-red-500/40"
                                        : "border-transparent hover:border-border hover:bg-muted/50"
                            )}
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className={cn(
                                    "relative p-2 rounded-lg shrink-0 transition-all",
                                    activeAccountId === acc.id
                                        ? acc.status === 'expired'
                                            ? "bg-red-500 text-white"
                                            : "bg-microtermix-neon text-microtermix-darker"
                                        : acc.status === 'expired'
                                            ? "bg-red-500/10 text-red-400"
                                            : "bg-muted text-muted-foreground"
                                )}>
                                    <ShieldCheck className="w-4 h-4" />
                                    {activeAccountId === acc.id && (
                                        <div className={cn(
                                            "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-card animate-pulse",
                                            acc.status === 'expired' ? "bg-red-400" : "bg-emerald-400"
                                        )} />
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <p className={cn(
                                        "text-xs font-black truncate tracking-tight",
                                        activeAccountId === acc.id ? "text-foreground" : "text-muted-foreground",
                                        acc.status === 'expired' && "text-red-400"
                                    )}>{acc.name}</p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <Badge variant="outline" className={cn(
                                            "text-[8px] font-black py-0 px-1 h-3.5 uppercase",
                                            acc.status === 'expired'
                                                ? "border-red-500/30 text-red-500"
                                                : "border-border text-muted-foreground"
                                        )}>
                                            {acc.status === 'expired' ? 'Expirada' : acc.region}
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm(`¿Eliminar cuenta "${acc.name}"?`)) removeAccount(acc.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-400 transition-all rounded-lg hover:bg-red-400/10"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                                <ChevronRight className={cn(
                                    "w-4 h-4 transition-all",
                                    activeAccountId === acc.id ? "text-microtermix-neon translate-x-0.5" : "text-muted-foreground/30"
                                )} />
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Add account */}
            <div className="p-2 border-t border-border">
                <AccountCreateDialog />
            </div>

            {/* SM Plugin global */}
            <div className="p-3 border-t border-border space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-[9px] uppercase font-black tracking-widest text-muted-foreground">SM Plugin</Label>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={detectPlugin}
                        disabled={isDetecting}
                        className="h-5 text-[8px] font-black uppercase tracking-widest text-microtermix-neon hover:bg-microtermix-neon/5 px-2"
                    >
                        <RefreshCw className={cn("w-2.5 h-2.5 mr-1", isDetecting && "animate-spin")} />
                        Detectar
                    </Button>
                </div>
                <Input
                    value={globalSettings.ssmPluginPath || ''}
                    onChange={e => updateGlobalSettings({ ssmPluginPath: e.target.value })}
                    placeholder="/usr/local/bin/..."
                    className="h-7 rounded-lg font-mono text-[9px] border-border bg-background"
                />
                {detectedPath && (
                    <p className="text-[8px] text-muted-foreground italic truncate">{detectedPath}</p>
                )}
            </div>
        </div>
    );
};
