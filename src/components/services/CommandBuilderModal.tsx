import React, { useState } from 'react';
import { Plus, X, GripVertical, Check, TerminalSquare, FolderOpen } from 'lucide-react';
import type { CommandStep } from '../../types/commands';
import { useWorkspace } from '../../context/WorkspaceContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

interface CommandBuilderModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (name: string, command: string, steps: CommandStep[]) => void;
    initialName?: string;
    initialSteps?: CommandStep[];
}

export const CommandBuilderModal: React.FC<CommandBuilderModalProps> = ({
    open,
    onOpenChange,
    onSave,
    initialName,
    initialSteps,
}) => {
    const { state } = useWorkspace();
    const savedCommandNames = Object.keys(state.savedCommands || {});

    const [commandName, setCommandName] = useState(initialName || '');
    const [steps, setSteps] = useState<CommandStep[]>(() => {
        if (initialSteps && initialSteps.length > 0) return initialSteps;
        return [
            { id: Math.random().toString(36).substring(7), type: 'env', value: '{{ENVS}}' },
            { id: Math.random().toString(36).substring(7), type: 'command', value: '' }
        ];
    });
    const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

    const addStep = (type: 'env' | 'command') => {
        setSteps([...steps, {
            id: Math.random().toString(36).substring(7),
            type,
            value: type === 'env' ? '{{ENVS}}' : ''
        }]);
    };

    const updateStep = (id: string, value: string) => {
        setSteps(steps.map(s => s.id === id ? { ...s, value } : s));
    };

    const removeStep = (id: string) => {
        setSteps(steps.filter(s => s.id !== id));
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
        e.dataTransfer.setData('text/plain', String(index));
        e.dataTransfer.effectAllowed = 'move';
        setDraggedIdx(index);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverIdx(index);
    };

    const handleDrop = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (isNaN(from) || from === index) return;
        setSteps(prev => {
            const next = [...prev];
            const [item] = next.splice(from, 1);
            next.splice(index, 0, item);
            return next;
        });
        setDraggedIdx(null);
        setDragOverIdx(null);
    };

    const handleDragEnd = () => {
        setDraggedIdx(null);
        setDragOverIdx(null);
    };

    const generateCommandPreview = () => {
        // Reglas de construcción:
        // - {{ENVS}} seguido de un comando → "cross-env {{ENVS}} cmd" (sin && entre ellos)
        // - Comando seguido de otro comando → "cmd1 && cmd2"
        // - Comando seguido de (ENVS + cmd) → "cmd1 && cross-env {{ENVS}} cmd2"
        // - {{ENVS}} al final sin comando siguiente → se ignora
        const parts: string[] = [];
        let pendingEnv = false;

        for (const step of steps) {
            if (step.type === 'env') {
                pendingEnv = true;
            } else if (step.value.trim()) {
                const cmd = step.value.trim();
                parts.push(pendingEnv ? `npx cross-env {{ENVS}} ${cmd}` : cmd);
                pendingEnv = false;
            }
        }

        return parts.join(' && ');
    };

    const handleSave = () => {
        const cmd = generateCommandPreview();
        const trimmedName = commandName.trim();
        if (cmd && trimmedName) {
            onSave(trimmedName, cmd, steps);
        }
    };

    const loadCommand = (name: string) => {
        if (!name) return;
        const savedSteps = (state.savedCommandSteps || {})[name];
        const rawCmd = (state.savedCommands || {})[name];
        setCommandName(name);
        if (savedSteps && savedSteps.length > 0) {
            setSteps(savedSteps);
        } else if (rawCmd) {
            setSteps([{ id: Math.random().toString(36).substring(7), type: 'command', value: rawCmd }]);
        }
    };

    const generatedPreview = generateCommandPreview();
    const canSave = generatedPreview !== '' && commandName.trim() !== '';
    const isEditing = !!initialName;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-4xl w-[90vw] max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700 p-0"
                showCloseButton={false}
            >
                <DialogHeader className="flex flex-row items-center gap-2 p-4 border-b border-slate-800">
                    <TerminalSquare className="text-nexus-neon" size={18} />
                    <DialogTitle className="text-slate-200">
                        {isEditing ? 'Edit Command' : 'Command Builder'}
                    </DialogTitle>
                    <Button
                        variant="ghost" size="icon-sm"
                        onClick={() => onOpenChange(false)}
                        className="ml-auto text-slate-500 hover:text-slate-300"
                    >
                        <X size={16} />
                    </Button>
                </DialogHeader>

                {/* Body — todo el contenido existente */}
                <div className="p-4 flex-1 overflow-y-auto">
                    <p className="text-xs text-slate-400 mb-4">
                        Construye un comando compuesto arrastrando pasos. <span className="text-nexus-neon bg-slate-800 px-1 rounded font-mono">{"{{ENVS}}"}</span> seguido de un comando genera <span className="font-mono bg-slate-800 px-1 rounded text-xs">cross-env KEY=VAL cmd</span>. Los comandos sin env se unen con <span className="font-mono bg-slate-800 px-1 rounded">&&</span>.
                    </p>

                    {/* Load existing command selector */}
                    {savedCommandNames.length > 0 && (
                        <div className="mb-5 p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
                            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                <FolderOpen size={12} /> Cargar comando guardado
                            </label>
                            <Select
                                value={undefined}
                                onValueChange={(v) => { if (v) loadCommand(v); }}
                            >
                                <SelectTrigger className="w-full bg-slate-900 border-slate-700 focus:ring-nexus-neon text-sm text-slate-300">
                                    <SelectValue placeholder="-- Seleccionar para editar --" />
                                </SelectTrigger>
                                <SelectContent>
                                    {savedCommandNames.map(n => (
                                        <SelectItem key={n} value={n}>{n}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="mb-6">
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nombre del Comando</label>
                        <Input
                            placeholder="Ej: Build & Preview"
                            value={commandName}
                            onChange={(e) => setCommandName(e.target.value)}
                            className="bg-slate-950 border-slate-700 focus-visible:ring-nexus-neon text-sm"
                            autoFocus
                        />
                    </div>

                    <div className="space-y-2 mb-6">
                        {steps.map((step, index) => (
                            <div
                                key={step.id}
                                className={`flex items-center gap-2 bg-slate-950 p-2 rounded-lg border transition-colors ${dragOverIdx === index && draggedIdx !== index
                                        ? 'border-nexus-neon'
                                        : 'border-slate-800 hover:border-slate-700'
                                    } ${draggedIdx === index ? 'opacity-40' : ''}`}
                                draggable
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDrop={(e) => handleDrop(e, index)}
                                onDragEnd={handleDragEnd}
                            >
                                <div className="cursor-grab text-slate-500 active:cursor-grabbing">
                                    <GripVertical size={16} />
                                </div>

                                {step.type === 'env' ? (
                                    <div className="flex-1 flex items-center">
                                        <div className="bg-nexus-neon/20 text-nexus-neon border border-nexus-neon/30 font-mono text-xs px-2 py-1 rounded select-none">
                                            {`{{ENVS}}`}
                                        </div>
                                    </div>
                                ) : (
                                    <Input
                                        placeholder="Ej: npm run build"
                                        value={step.value}
                                        onChange={(e) => updateStep(step.id, e.target.value)}
                                        draggable={false}
                                        className="flex-1 bg-slate-900 border-slate-700 focus-visible:ring-nexus-neon hover:border-slate-600 h-8 font-mono text-sm"
                                    />
                                )}

                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => removeStep(step.id)}
                                    className="h-7 w-7 text-slate-500 hover:text-nexus-danger hover:bg-slate-900 transition-colors shrink-0"
                                >
                                    <X size={16} />
                                </Button>
                            </div>
                        ))}

                        {steps.length === 0 && (
                            <div className="text-center py-6 text-slate-500 text-sm border border-dashed border-slate-800 rounded-lg">
                                No hay pasos. Agrega un comando para comenzar.
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2 p-4 pt-0">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addStep('command')}
                            className="flex items-center gap-1.5 h-8 bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 hover:border-slate-600 transition-colors"
                        >
                            <Plus size={14} /> Comando
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addStep('env')}
                            className="flex items-center gap-1.5 h-8 bg-nexus-neon/10 hover:bg-nexus-neon/20 text-nexus-neon border-nexus-neon/30 hover:border-nexus-neon/50 transition-colors"
                        >
                            <Plus size={14} /> Variables de Entorno (ENVS)
                        </Button>
                    </div>
                </div>

                <DialogFooter
                    className="-mx-0 -mb-0 p-4 border-t border-slate-800 bg-slate-950/50 rounded-b-xl flex-col sm:flex-col gap-3"
                    showCloseButton={false}
                >
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                            Vista Previa Generada
                        </label>
                        <div className="bg-slate-950 border border-slate-800 rounded p-3 font-mono text-sm text-slate-300 min-h-[44px] break-all">
                            {generatedPreview || <span className="text-slate-600 italic">El comando aparecerá aquí...</span>}
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400">
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={!canSave}
                            title={!canSave ? 'Se requiere un Nombre y al menos un Comando' : ''}
                            className="bg-nexus-neon text-slate-900 hover:bg-nexus-neon/80 font-bold"
                        >
                            <Check size={14} />
                            {isEditing ? 'Guardar Cambios' : 'Guardar & Aplicar'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
