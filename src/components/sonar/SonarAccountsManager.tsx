import React, { useState } from 'react';
import { useSonarStore, SonarAccount, DEFAULT_SONAR_ACCOUNT } from '../../stores/sonarStore';
import { 
    Plus, Trash2, Globe, Shield, Save, Server, 
    Settings, CheckCircle2
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle,
    DialogFooter,
    DialogDescription
} from '../ui/dialog';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

export const SonarAccountsManager: React.FC = () => {
    const accounts = useSonarStore(s => s.accounts);
    const activeAccountId = useSonarStore(s => s.activeAccountId);
    const addAccount = useSonarStore(s => s.addAccount);
    const updateAccount = useSonarStore(s => s.updateAccount);
    const removeAccount = useSonarStore(s => s.removeAccount);
    const setActiveAccount = useSonarStore(s => s.setActiveAccount);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState<SonarAccount>({
        ...DEFAULT_SONAR_ACCOUNT,
        id: '',
    });

    const handleOpenAdd = () => {
        setFormData({ ...DEFAULT_SONAR_ACCOUNT, id: crypto.randomUUID() });
        setEditingId(null);
        setIsDialogOpen(true);
    };

    const handleSave = () => {
        if (!formData.name || !formData.serverUrl || !formData.token) {
            toast.error("Campos obligatorios faltantes");
            return;
        }

        if (editingId) {
            updateAccount(editingId, formData);
            toast.success("Cuenta actualizada");
        } else {
            addAccount({ ...formData, id: crypto.randomUUID() });
            toast.success("Cuenta añadida");
        }
        
        setIsDialogOpen(false);
        setEditingId(null);
    };

    const handleEdit = (account: SonarAccount) => {
        setFormData(account);
        setEditingId(account.id);
        setIsDialogOpen(true);
    };

    const confirmDelete = () => {
        if (deleteId) {
            removeAccount(deleteId);
            setDeleteId(null);
            toast.success("Cuenta eliminada");
        }
    };

    return (
        <div className="flex-1 overflow-y-auto p-6 bg-[#020617] animate-in fade-in duration-500 font-sans">
            <div className="max-w-3xl mx-auto space-y-6">
                
                {/* Header Minimalista */}
                <div className="flex items-center justify-between pb-4 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <Server size={18} className="text-blue-500" />
                        <h2 className="text-sm font-black text-slate-100 uppercase tracking-widest">Cuentas Sonar</h2>
                    </div>
                    <Button onClick={handleOpenAdd} size="sm" className="bg-blue-600 hover:bg-blue-500 text-white font-bold h-9 rounded-lg px-4 text-[10px] uppercase tracking-widest transition-all ring-1 ring-white/10 shadow-lg shadow-blue-900/20">
                        <Plus size={14} className="mr-2" strokeWidth={3} />
                        Añadir
                    </Button>
                </div>

                {/* Lista Compacta */}
                <div className="grid grid-cols-1 gap-2">
                    {accounts.length === 0 ? (
                        <div className="py-20 flex flex-col items-center justify-center bg-slate-900/10 border border-dashed border-slate-800/40 rounded-2xl text-slate-700 gap-4">
                            <Server size={32} strokeWidth={1} className="opacity-10" />
                            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-700">Sin cuentas</p>
                        </div>
                    ) : accounts.map((account) => {
                        const isActive = activeAccountId === account.id;
                        return (
                            <div key={account.id} className={cn(
                                "group flex items-center gap-4 p-3 pr-4 rounded-xl border transition-all duration-200",
                                isActive ? "bg-blue-600/5 border-blue-500/30 shadow-sm" : "bg-slate-900/30 border-white/5 hover:border-slate-700 hover:bg-slate-900/50"
                            )}>
                                <div className={cn(
                                    "p-2.5 rounded-lg border shrink-0",
                                    isActive ? "bg-blue-500/10 border-blue-500/20 text-blue-400" : "bg-slate-800/50 border-slate-700/50 text-slate-500"
                                )}>
                                    <Globe size={16} />
                                </div>
                                
                                <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
                                    <div className="flex flex-col text-left">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-slate-100 truncate uppercase tracking-tight">{account.name}</span>
                                            {isActive && <Badge className="h-4 px-1.5 text-[8px] bg-blue-500/20 text-blue-400 border-none uppercase font-black tracking-tighter">Default</Badge>}
                                        </div>
                                        <span className="text-[10px] text-slate-500 font-mono truncate max-w-[200px]">{account.serverUrl}</span>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <div className="hidden sm:flex h-7 bg-black/40 rounded-md px-3 items-center gap-2 border border-white/5">
                                            <Shield size={10} className="text-slate-600" />
                                            <span className="text-[9px] font-mono text-slate-600 uppercase tracking-tighter">Token: ••••{account.token.slice(-4)}</span>
                                        </div>

                                        <div className="flex items-center gap-1">
                                            {!isActive && (
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm"
                                                    onClick={() => setActiveAccount(account.id)}
                                                    className="h-8 px-2 text-[9px] font-black text-slate-500 hover:text-blue-400 uppercase tracking-widest"
                                                >
                                                    Set Default
                                                </Button>
                                            )}
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                onClick={() => handleEdit(account)}
                                                className="h-8 w-8 text-slate-600 hover:text-white hover:bg-white/5"
                                            >
                                                <Settings size={14} />
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                onClick={() => setDeleteId(account.id)}
                                                className="h-8 w-8 text-slate-600 hover:text-red-500 hover:bg-red-500/10"
                                            >
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer Compacto */}
                <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl flex items-center gap-4">
                    <CheckCircle2 className="text-blue-500 shrink-0" size={14} />
                    <p className="text-[10px] text-slate-500 font-medium">
                        La cuenta <span className="text-blue-400 font-bold uppercase">Default</span> será usada por el API a menos que se sobreescriba en el proyecto.
                    </p>
                </div>
            </div>

            {/* Modal de Formulario Reutilizando Dialog UI */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-md bg-slate-950 border-slate-800 p-6 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.4)]">
                    <DialogHeader className="mb-4">
                        <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">
                            {editingId ? 'Editar Cuenta' : 'Nueva Cuenta'}
                        </DialogTitle>
                        <DialogDescription className="text-[10px] text-slate-500 uppercase tracking-tight font-medium">
                            Configuración de credenciales Sonar
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2 text-left">
                                <Label className="text-[9px] text-slate-500 uppercase font-black tracking-widest ml-1">Nombre</Label>
                                <Input 
                                    placeholder="Mi SonarCloud" 
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="h-10 bg-black/40 border-slate-800 rounded-lg text-xs"
                                />
                            </div>
                            <div className="space-y-2 text-left">
                                <Label className="text-[9px] text-slate-500 uppercase font-black tracking-widest ml-1">Org (Cloud)</Label>
                                <Input 
                                    placeholder="org-name" 
                                    value={formData.organization || ''}
                                    onChange={e => setFormData({ ...formData, organization: e.target.value })}
                                    className="h-10 bg-black/40 border-slate-800 rounded-lg font-mono text-[10px]"
                                />
                            </div>
                        </div>

                        <div className="space-y-2 text-left">
                            <Label className="text-[9px] text-slate-500 uppercase font-black tracking-widest ml-1">URL Servidor</Label>
                            <Input 
                                placeholder="https://sonarcloud.io" 
                                value={formData.serverUrl}
                                onChange={e => setFormData({ ...formData, serverUrl: e.target.value })}
                                className="h-10 bg-black/40 border-slate-800 rounded-lg font-mono text-[10px]"
                            />
                        </div>

                        <div className="space-y-2 text-left">
                            <Label className="text-[9px] text-slate-500 uppercase font-black tracking-widest ml-1">Security Token</Label>
                            <Input 
                                type="password"
                                placeholder="Tu token..." 
                                value={formData.token}
                                onChange={e => setFormData({ ...formData, token: e.target.value })}
                                className="h-10 bg-black/40 border-slate-800 rounded-lg font-mono text-[10px]"
                            />
                        </div>
                    </div>

                    <DialogFooter className="mt-8 flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="text-xs font-bold uppercase tracking-widest text-slate-500 h-10 px-4">Descargar</Button>
                        <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-500 text-white font-black px-8 h-10 rounded-lg text-[10px] uppercase tracking-widest ring-1 ring-white/10">
                            <Save size={14} className="mr-2" />
                            {editingId ? 'Actualizar' : 'Guardar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Diálogo de Confirmación para Borrado */}
            <ConfirmationDialog 
                isOpen={!!deleteId}
                title="Eliminar Cuenta"
                description="¿Estás seguro de que deseas eliminar esta cuenta? Esta acción no se puede deshacer y puede afectar a los proyectos vinculados."
                confirmLabel="Eliminar"
                type="danger"
                onConfirm={confirmDelete}
                onCancel={() => setDeleteId(null)}
            />
        </div>
    );
};
