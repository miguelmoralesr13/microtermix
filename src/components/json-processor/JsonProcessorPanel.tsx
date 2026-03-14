import React, { useState } from 'react';
import {
    Braces, AlignLeft, CheckCircle2, Code2, GitBranch,
    Search, ArrowLeftRight, GitCompareArrows, SquarePen, Table2, HelpCircle,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { JsonPrettierTab } from './JsonPrettierTab';
import { JsonValidatorTab } from './JsonValidatorTab';
import { JsonTypeConverterTab } from './JsonTypeConverterTab';
import { JsonTreeViewTab } from './JsonTreeViewTab';
import { JsonPathTab } from './JsonPathTab';
import { JsonFormatTab } from './JsonFormatTab';
import { JsonDiffTab } from './JsonDiffTab';
import { JsonNodeEditorTab } from './JsonNodeEditorTab';
import { JsonFlatTab } from './JsonFlatTab';

const TABS = [
    {
        id: 'prettier', label: 'Prettier', Icon: AlignLeft,
        description: 'Formatea JSON, minifica, escapa strings o limpia caracteres de escape (ideal para logs de AWS).'
    },
    {
        id: 'validator', label: 'Validador', Icon: CheckCircle2,
        description: 'Verifica la sintaxis JSON y localiza errores exactos por número de línea.'
    },
    {
        id: 'converter', label: 'Tipos', Icon: Code2,
        description: 'Genera definiciones de tipos (TS, Go, C#, Python) a partir de una muestra JSON.'
    },
    {
        id: 'tree', label: 'Tree View', Icon: GitBranch,
        description: 'Explora visualmente la jerarquía del JSON en un árbol interactivo.'
    },
    {
        id: 'jsonpath', label: 'JSONPath', Icon: Search,
        description: 'Filtra y extrae datos específicos usando expresiones estándar de JSONPath.'
    },
    {
        id: 'format', label: 'Formatos', Icon: ArrowLeftRight,
        description: 'Transforma datos entre JSON y otros formatos como YAML, XML o CSV.'
    },
    {
        id: 'diff', label: 'Diff', Icon: GitCompareArrows,
        description: 'Compara dos JSONs para visualizar inserciones, eliminaciones y cambios.'
    },
    {
        id: 'nodes', label: 'Editor Visual', Icon: SquarePen,
        description: 'Manipula la estructura JSON usando un editor gráfico de nodos.'
    },
    {
        id: 'flat', label: 'Aplanar', Icon: Table2,
        description: 'Convierte objetos anidados en una lista plana de claves (ej: user.address.city).'
    },
] as const;

type TabId = typeof TABS[number]['id'];

const STORAGE_KEY = 'microtermix-json-processor-tab';

export const JsonProcessorPanel: React.FC = () => {
    const [active, setActive] = useState<TabId>(() => {
        try { return (localStorage.getItem(STORAGE_KEY) as TabId) || 'prettier'; } catch { return 'prettier'; }
    });

    const activeTabData = TABS.find(t => t.id === active);

    const handleChange = (val: string) => {
        setActive(val as TabId);
        try { localStorage.setItem(STORAGE_KEY, val); } catch { /* */ }
    };

    return (
        <div className="flex flex-col h-full w-full min-h-0 bg-slate-900">
            {/* Header */}
            <div className="shrink-0 flex items-center bg-slate-950 border-b border-slate-800 pr-4">
                <div className="flex items-center gap-2 px-4 py-3 border-r border-slate-800 shrink-0">
                    <Braces size={15} className="text-violet-400" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">JSON Processor</span>
                </div>
                <div className="overflow-x-auto flex-1 scrollbar-hide">
                    <Tabs value={active} onValueChange={handleChange}>
                        <TabsList variant="line" className="h-12 rounded-none bg-transparent px-1">
                            {TABS.map(({ id, label, Icon, description }) => (
                                <Tooltip key={id}>
                                    <TooltipTrigger render={
                                        <TabsTrigger value={id} className="gap-1.5 text-xs px-4 h-full whitespace-nowrap">
                                            <Icon size={13} /> {label}
                                        </TabsTrigger>
                                    } />
                                    <TooltipContent side="bottom" className="max-w-[200px] text-center">
                                        {description}
                                    </TooltipContent>
                                </Tooltip>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>

                {activeTabData && (
                    <Popover>
                        <PopoverTrigger render={
                            <Button variant="ghost" size="icon-xs" className="ml-2 text-slate-600 hover:text-slate-400">
                                <HelpCircle size={16} />
                            </Button>
                        } />
                        <PopoverContent side="bottom" align="end" className="bg-slate-800 border-slate-700 text-slate-200 p-4 max-w-[300px] shadow-2xl z-50">
                            <div className="space-y-2">
                                <h4 className="font-bold text-microtermix-neon flex items-center gap-2">
                                    <activeTabData.Icon size={14} /> {activeTabData.label}
                                </h4>
                                <p className="text-xs leading-relaxed text-slate-300">
                                    {activeTabData.description}
                                </p>
                                <div className="pt-2 border-t border-slate-700 mt-2">
                                    <p className="text-[10px] text-slate-500 italic">
                                        💡 Tip: Puedes usar el editor de la izquierda para pegar tu JSON y ver el resultado en tiempo real a la derecha.
                                    </p>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-hidden">
                {active === 'prettier' && <JsonPrettierTab />}
                {active === 'validator' && <JsonValidatorTab />}
                {active === 'converter' && <JsonTypeConverterTab />}
                {active === 'tree' && <JsonTreeViewTab />}
                {active === 'jsonpath' && <JsonPathTab />}
                {active === 'format' && <JsonFormatTab />}
                {active === 'diff' && <JsonDiffTab />}
                {active === 'nodes' && <JsonNodeEditorTab />}
                {active === 'flat' && <JsonFlatTab />}
            </div>
        </div>
    );
};
