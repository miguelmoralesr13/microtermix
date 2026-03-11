import React, { useState } from 'react';
import {
    Braces, AlignLeft, CheckCircle2, Code2, GitBranch,
    Search, ArrowLeftRight, GitCompareArrows, SquarePen, Table2,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
    { id: 'prettier', label: 'Prettier', Icon: AlignLeft },
    { id: 'validator', label: 'Validador', Icon: CheckCircle2 },
    { id: 'converter', label: 'Tipos', Icon: Code2 },
    { id: 'tree', label: 'Tree View', Icon: GitBranch },
    { id: 'jsonpath', label: 'JSONPath', Icon: Search },
    { id: 'format', label: 'Formatos', Icon: ArrowLeftRight },
    { id: 'diff', label: 'Diff', Icon: GitCompareArrows },
    { id: 'nodes', label: 'Editor Visual', Icon: SquarePen },
    { id: 'flat', label: 'Aplanar', Icon: Table2 },
] as const;

type TabId = typeof TABS[number]['id'];

const STORAGE_KEY = 'nexus-json-processor-tab';

export const JsonProcessorPanel: React.FC = () => {
    const [active, setActive] = useState<TabId>(() => {
        try { return (localStorage.getItem(STORAGE_KEY) as TabId) || 'prettier'; } catch { return 'prettier'; }
    });

    const handleChange = (val: string) => {
        setActive(val as TabId);
        try { localStorage.setItem(STORAGE_KEY, val); } catch { /* */ }
    };

    return (
        <div className="flex flex-col h-full w-full min-h-0 bg-slate-900">
            {/* Header */}
            <div className="shrink-0 flex items-center bg-slate-950 border-b border-slate-800">
                <div className="flex items-center gap-2 px-4 py-3 border-r border-slate-800 shrink-0">
                    <Braces size={15} className="text-violet-400" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">JSON Processor</span>
                </div>
                <div className="overflow-x-auto">
                    <Tabs value={active} onValueChange={handleChange}>
                        <TabsList variant="line" className="h-12 rounded-none bg-transparent px-1">
                            {TABS.map(({ id, label, Icon }) => (
                                <TabsTrigger key={id} value={id} className="gap-1.5 text-xs px-4 h-full whitespace-nowrap">
                                    <Icon size={13} /> {label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>
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
