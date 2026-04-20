import { ShieldCheck, Settings } from 'lucide-react';
import { useAwsStore } from '../../stores/awsStore';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { AccountSidebar } from './AccountSidebar';
import { AccountDetailView } from './AccountDetailView';

interface SettingsTabProps {
    onSaved: () => void;
}

export function SettingsTab({ onSaved }: SettingsTabProps) {
    const { accounts, activeAccountId } = useAwsStore();
    const activeAccount = accounts.find(a => a.id === activeAccountId);
    const isConfigured = !!(activeAccount?.accessKeyId && activeAccount?.secretAccessKey);

    return (
        <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
            {/* Compact header */}
            <div className="shrink-0 px-6 py-3 border-b border-border flex items-center justify-between bg-card/80 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-microtermix-neon/10 rounded-xl border border-microtermix-neon/20 text-microtermix-neon">
                        <Settings size={18} />
                    </div>
                    <div className="text-left">
                        <h2 className="text-sm font-black text-foreground uppercase tracking-widest leading-none">AWS Multi-Auth Hub</h2>
                        <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mt-1">Credential Manager</p>
                    </div>
                </div>
                <Badge variant="outline" className={cn(
                    "text-[10px] uppercase font-black tracking-widest",
                    activeAccount?.status === 'expired'
                        ? "border-red-500 text-red-500 bg-red-500/10"
                        : isConfigured
                            ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/5"
                            : "border-border text-muted-foreground"
                )}>
                    {activeAccount?.status === 'expired' ? 'Sesión Expirada' : isConfigured ? 'Configurado' : 'Sin Configurar'}
                </Badge>
            </div>

            {/* Body */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
                <AccountSidebar />
                <div className="flex-1 overflow-y-auto p-6">
                    {!activeAccount ? (
                        <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground">
                            <div className="p-6 bg-muted/20 rounded-3xl border border-border">
                                <ShieldCheck className="w-10 h-10" />
                            </div>
                            <p className="text-sm font-black text-foreground uppercase tracking-widest">Centro de Control AWS</p>
                            <p className="text-xs text-center max-w-xs leading-relaxed">
                                Seleccioná un perfil de la barra lateral para gestionar sus credenciales.
                            </p>
                        </div>
                    ) : (
                        <AccountDetailView account={activeAccount} onSaved={onSaved} />
                    )}
                </div>
            </div>
        </div>
    );
}
