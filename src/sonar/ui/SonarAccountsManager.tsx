import React, { useState } from 'react';
import { useSonarStore, type SonarAccount, DEFAULT_SONAR_ACCOUNT } from '@/stores/sonarStore';
import {
    Plus, Trash2, Globe, Shield, Save, Server,
    Pencil, CheckCircle2, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { cn } from '@/lib/utils';
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
        <div className="flex-1 overflow-hidden flex flex-col bg-background animate-in fade-in duration-300 font-sans">
            {/* Header bar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/10 shrink-0">
                <div className="flex items-center gap-2">
                    <Server size={14} className="text-muted-foreground" />
                    <h2 className="text-[10px] font-bold text-foreground uppercase tracking-wider">Cuentas Sonar</h2>
                    <Badge variant="outline" className="h-4 px-1.5 text-[9px] text-muted-foreground">{accounts.length}</Badge>
                </div>
                <Button onClick={handleOpenAdd} size="sm" className="h-6 px-2 text-[9px] font-bold uppercase tracking-wide gap-1">
                    <Plus size={11} />
                    Añadir
                </Button>
            </div>

            {/* Accounts table */}
            <div className="flex-1 overflow-auto">
                {accounts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground/50">
                        <Server size={20} strokeWidth={1} />
                        <p className="text-[9px] font-bold uppercase tracking-widest">Sin cuentas</p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow className="border-border/50">
                                <TableHead className="w-8 py-1 px-2 text-[9px] font-bold"></TableHead>
                                <TableHead className="py-1 px-2 text-[9px] font-bold">Nombre</TableHead>
                                <TableHead className="py-1 px-2 text-[9px] font-bold">URL</TableHead>
                                <TableHead className="py-1 px-2 text-[9px] font-bold">Token</TableHead>
                                <TableHead className="py-1 px-2 text-[9px] font-bold">Org</TableHead>
                                <TableHead className="w-28 py-1 px-2 text-[9px] font-bold text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {accounts.map((account) => {
                                const isActive = activeAccountId === account.id;
                                return (
                                    <TableRow
                                        key={account.id}
                                        className={cn(
                                            "border-border/50",
                                            isActive && "bg-blue-500/5"
                                        )}
                                    >
                                        <TableCell className="py-1 px-2 w-8">
                                            {isActive ? (
                                                <Check size={12} className="text-blue-400" />
                                            ) : (
                                                <Globe size={12} className="text-muted-foreground/50" />
                                            )}
                                        </TableCell>
                                        <TableCell className="py-1 px-2">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-bold text-foreground truncate">{account.name}</span>
                                                {isActive && (
                                                    <Badge variant="outline" className="h-3.5 px-1 text-[8px] font-bold text-blue-400 border-blue-500/30">
                                                        Default
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-1 px-2 max-w-[200px]">
                                            <span className="text-[10px] text-muted-foreground font-mono truncate block" title={account.serverUrl}>
                                                {account.serverUrl}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-1 px-2">
                                            <div className="flex items-center gap-1 text-muted-foreground/60">
                                                <Shield size={9} />
                                                <span className="text-[9px] font-mono">••••{account.token.slice(-4)}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-1 px-2">
                                            <span className="text-[10px] text-muted-foreground font-mono">
                                                {account.organization || '-'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-1 px-2 text-right">
                                            <div className="flex items-center justify-end gap-0.5">
                                                {!isActive && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setActiveAccount(account.id)}
                                                        className="h-5 px-1.5 text-[8px] font-bold text-muted-foreground hover:text-blue-400 uppercase tracking-wide"
                                                    >
                                                        Default
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleEdit(account)}
                                                    className="h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                                >
                                                    <Pencil size={10} />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setDeleteId(account.id)}
                                                    className="h-5 w-5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                                                >
                                                    <Trash2 size={10} />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-1.5 px-3 py-1 border-t border-border bg-muted/10 shrink-0">
                <CheckCircle2 size={11} className="text-blue-400 shrink-0" />
                <p className="text-[9px] text-muted-foreground">
                    La cuenta <span className="text-blue-400 font-bold">Default</span> se usa por el API a menos que se sobreescriba en el proyecto.
                </p>
            </div>

            {/* Edit/Add Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-md bg-background border-border p-0 rounded-lg shadow-2xl">
                    <DialogHeader className="px-4 pt-4 pb-2">
                        <DialogTitle className="text-xs font-bold uppercase tracking-wider text-foreground">
                            {editingId ? 'Editar Cuenta' : 'Nueva Cuenta'}
                        </DialogTitle>
                        <DialogDescription className="text-[9px] text-muted-foreground uppercase tracking-tight">
                            Configuración de credenciales Sonar
                        </DialogDescription>
                    </DialogHeader>

                    <div className="px-4 pb-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-[9px] text-muted-foreground uppercase font-bold tracking-wide">Nombre</Label>
                                <Input
                                    placeholder="Mi SonarCloud"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="h-8 bg-muted/50 border-border/50 rounded text-xs"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[9px] text-muted-foreground uppercase font-bold tracking-wide">Org (Cloud)</Label>
                                <Input
                                    placeholder="org-name"
                                    value={formData.organization || ''}
                                    onChange={e => setFormData({ ...formData, organization: e.target.value })}
                                    className="h-8 bg-muted/50 border-border/50 rounded font-mono text-[10px]"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <Label className="text-[9px] text-muted-foreground uppercase font-bold tracking-wide">URL Servidor</Label>
                            <Input
                                placeholder="https://sonarcloud.io"
                                value={formData.serverUrl}
                                onChange={e => setFormData({ ...formData, serverUrl: e.target.value })}
                                className="h-8 bg-muted/50 border-border/50 rounded font-mono text-[10px]"
                            />
                        </div>

                        <div className="space-y-1">
                            <Label className="text-[9px] text-muted-foreground uppercase font-bold tracking-wide">Security Token</Label>
                            <Input
                                type="password"
                                placeholder="Tu token..."
                                value={formData.token}
                                onChange={e => setFormData({ ...formData, token: e.target.value })}
                                className="h-8 bg-muted/50 border-border/50 rounded font-mono text-[10px]"
                            />
                        </div>
                    </div>

                    <DialogFooter className="px-4 pb-4 flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="text-[9px] font-bold uppercase tracking-wide h-8 px-3">
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 h-8 rounded text-[9px] uppercase tracking-wide gap-1">
                            <Save size={11} />
                            {editingId ? 'Actualizar' : 'Guardar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
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
