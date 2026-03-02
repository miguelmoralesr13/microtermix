import React, { useState } from 'react';
import { Plus, X, GripVertical, Check, TerminalSquare, FolderOpen } from 'lucide-react';
import type { CommandStep } from '../../types/commands';
import { useWorkspace } from '../../context/WorkspaceContext';

interface CommandBuilderModalProps {
    onClose: () => void;
    onSave: (name: string, command: string, steps: CommandStep[]) => void;
    initialName?: string;
    initialSteps?: CommandStep[];
}

export const CommandBuilderModal: React.FC<CommandBuilderModalProps> = ({
    onClose,
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-4 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                        <TerminalSquare className="text-nexus-neon" size={20} />
                        <h2 className="text-lg font-bold text-slate-200">
                            {isEditing ? 'Edit Command' : 'Command Builder'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-300 transition-colors">
                        <X size={20} />
                    </button>
                </div>

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
                            <select
                                defaultValue=""
                                onChange={(e) => { loadCommand(e.target.value); e.target.value = ''; }}
                                className="w-full bg-slate-900 border border-slate-700 focus:border-nexus-neon rounded px-3 py-2 text-sm text-slate-300 focus:outline-none transition-colors"
                            >
                                <option value="" disabled>-- Seleccionar para editar --</option>
                                {savedCommandNames.map(n => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="mb-6">
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nombre del Comando</label>
                        <input
                            type="text"
                            placeholder="Ej: Build & Preview"
                            value={commandName}
                            onChange={(e) => setCommandName(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 focus:border-nexus-neon rounded px-3 py-2 text-sm text-slate-200 focus:outline-none transition-colors"
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
                                    <input
                                        type="text"
                                        placeholder="Ej: npm run build"
                                        value={step.value}
                                        onChange={(e) => updateStep(step.id, e.target.value)}
                                        draggable={false}
                                        className="flex-1 bg-slate-900 border border-slate-700 focus:border-nexus-neon hover:border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none transition-colors font-mono"
                                    />
                                )}

                                <button
                                    onClick={() => removeStep(step.id)}
                                    className="p-1.5 text-slate-500 hover:text-nexus-danger hover:bg-slate-900 rounded transition-colors shrink-0"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ))}

                        {steps.length === 0 && (
                            <div className="text-center py-6 text-slate-500 text-sm border border-dashed border-slate-800 rounded-lg">
                                No hay pasos. Agrega un comando para comenzar.
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2 p-4 pt-0">
                        <button
                            onClick={() => addStep('command')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded border border-slate-700 hover:border-slate-600 transition-colors"
                        >
                            <Plus size={14} /> Comando
                        </button>
                        <button
                            onClick={() => addStep('env')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-nexus-neon/10 hover:bg-nexus-neon/20 text-nexus-neon text-xs font-semibold rounded border border-nexus-neon/30 hover:border-nexus-neon/50 transition-colors"
                        >
                            <Plus size={14} /> Variables de Entorno (ENVS)
                        </button>
                    </div>
                </div>

                <div className="p-4 border-t border-slate-800 bg-slate-950/50">
                    <div className="mb-4">
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Vista Previa Generada</label>
                        <div className="bg-slate-950 border border-slate-800 rounded p-3 font-mono text-sm text-slate-300 min-h-[44px] break-all">
                            {generatedPreview || <span className="text-slate-600 italic">El comando aparecerá aquí...</span>}
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 font-semibold text-sm text-slate-400 hover:text-slate-200 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!canSave}
                            title={!canSave ? "Se requiere un Nombre y al menos un Comando" : ""}
                            className="flex items-center gap-2 px-4 py-2 bg-nexus-neon text-slate-900 font-bold text-sm rounded hover:bg-[#00ffd5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Check size={16} /> {isEditing ? 'Guardar Cambios' : 'Guardar & Aplicar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
