import React, { useState } from 'react';
import { Plus, X, GripVertical, Check, TerminalSquare, FolderOpen } from 'lucide-react';
import type { CommandStep } from '../../types/commands';
import { useWorkspace } from '../../context/WorkspaceContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components//ui/dialog';
import { Button } from '@/components//ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components//ui/select';
import { Input } from '@/components//ui/input';

interface CommandBuilderModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (name: string, command: string, steps: CommandStep[], projectType?: string) => void;
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
    const [projectType, setProjectType] = useState<string>(() => {
        if (initialName && state.savedCommandTypes && state.savedCommandTypes[initialName]) {
            return state.savedCommandTypes[initialName];
        }
        return 'all';
    });
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
        // - {{ENVS}} seguido de un comando → "{{ENVS}} cmd"
        // - Comando seguido de otro comando → "cmd1 && cmd2"
        // - Comando seguido de (ENVS + cmd) → "cmd1 && {{ENVS}} cmd2"
        // - {{ENVS}} al final sin comando siguiente → se ignora
        const parts: string[] = [];
        let pendingEnv = false;

        for (const step of steps) {
            if (step.type === 'env') {
                pendingEnv = true;
            } else if (step.value.trim()) {
                const cmd = step.value.trim();
                parts.push(pendingEnv ? `{{ENVS}} ${cmd}` : cmd);
                pendingEnv = false;
            }
        }

        return parts.join(' && ');
    };

    const handleSave = () => {
        const cmd = generateCommandPreview();
        const trimmedName = commandName.trim();
        if (cmd && trimmedName) {
            onSave(trimmedName, cmd, steps, projectType === 'all' ? undefined : projectType);
        }
    };

    const loadCommand = (name: string) => {
        if (!name) return;
        const savedSteps = (state.savedCommandSteps || {})[name];
        const rawCmd = (state.savedCommands || {})[name];
        const savedType = (state.savedCommandTypes || {})[name] || 'all';
        setCommandName(name);
        setProjectType(savedType);
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
                    <TerminalSquare className="text-microtermix-neon" size={18} />
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
                        Construye un comando compuesto arrastrando pasos. El marcador <span className="text-microtermix-neon bg-slate-800 px-1 rounded font-mono">{"{{ENVS}}"}</span> se adaptará automáticamente: <span className="text-slate-200 font-mono">cross-env</span> para Node, <span className="text-slate-200 font-mono">-D</span> para Java (Maven/Gradle) o <span className="text-slate-200 font-mono">KEY=VAL</span> para otros.
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
                                <SelectTrigger className="w-full bg-slate-900 border-slate-700 focus:ring-microtermix-neon text-sm text-slate-300">
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nombre del Comando</label>
                            <Input
                                placeholder="Ej: Build & Preview"
                                value={commandName}
                                onChange={(e) => setCommandName(e.target.value)}
                                className="bg-slate-950 border-slate-700 focus-visible:ring-microtermix-neon text-sm"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tipo de Proyecto</label>
                            <Select
                                value={projectType}
                                onValueChange={(v) => v && setProjectType(v)}
                            >
                                <SelectTrigger className="bg-slate-950 border-slate-700 focus:ring-microtermix-neon text-sm">
                                    <SelectValue placeholder="Aplicar a..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Cualquier Proyecto (Global)</SelectItem>
                                    <SelectItem value="node">Node.js / Bun</SelectItem>
                                    <SelectItem value="java">Java (Maven/Gradle)</SelectItem>
                                    <SelectItem value="python">Python</SelectItem>
                                    <SelectItem value="go">Go</SelectItem>
                                    <SelectItem value="rust">Rust</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2 mb-6">
                        {steps.map((step, index) => (
                            <div
                                key={step.id}
                                className={`flex items-center gap-2 bg-slate-950 p-2 rounded-lg border transition-colors ${dragOverIdx === index && draggedIdx !== index
                                    ? 'border-microtermix-neon'
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
                                        <div className="bg-microtermix-neon/20 text-microtermix-neon border border-microtermix-neon/30 font-mono text-xs px-2 py-1 rounded select-none">
                                            {`{{ENVS}}`}
                                        </div>
                                    </div>
                                ) : (
                                    <Input
                                        placeholder="Ej: npm run build"
                                        value={step.value}
                                        onChange={(e) => updateStep(step.id, e.target.value)}
                                        draggable={false}
                                        className="flex-1 bg-slate-900 border-slate-700 focus-visible:ring-microtermix-neon hover:border-slate-600 h-8 font-mono text-sm"
                                    />
                                )}

                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => removeStep(step.id)}
                                    className="h-7 w-7 text-slate-500 hover:text-microtermix-danger hover:bg-slate-900 transition-colors shrink-0"
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
                            className="flex items-center gap-1.5 h-8 bg-microtermix-neon/10 hover:bg-microtermix-neon/20 text-microtermix-neon border-microtermix-neon/30 hover:border-microtermix-neon/50 transition-colors"
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
                            className="bg-microtermix-neon text-slate-900 hover:bg-microtermix-neon/80 font-bold"
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
