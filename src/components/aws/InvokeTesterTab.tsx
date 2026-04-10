import { useState, useEffect } from 'react';
import { Zap, GitBranch, Globe } from 'lucide-react';
import { LambdaInvoker } from './LambdaInvoker';
import { SfnInvoker } from './SfnInvoker';
import { ApiInvoker } from './ApiInvoker';
import { cn } from '@/lib/utils';
import { useCwStore } from '../../stores/cwStore';

type InvokerSubTab = 'lambda' | 'sfn' | 'api';

const SUB_TABS: { id: InvokerSubTab; label: string; icon: React.ReactNode }[] = [
    { id: 'lambda', label: 'Lambda', icon: <Zap size={12} /> },
    { id: 'sfn', label: 'Step Functions', icon: <GitBranch size={12} /> },
    { id: 'api', label: 'API Gateway', icon: <Globe size={12} /> },
];

export function InvokeTesterTab() {
    const [subTab, setSubTab] = useState<InvokerSubTab>('lambda');
    const { preloadedInvokerType } = useCwStore();

    // Switch sub-tab when navigated from Lambda/SFN tabs
    useEffect(() => {
        if (preloadedInvokerType === 'lambda' || preloadedInvokerType === 'sfn') {
            setSubTab(preloadedInvokerType);
        }
    }, [preloadedInvokerType]);

    return (
        <div className="flex flex-col h-full bg-slate-950">
            {/* Sub-tab bar */}
            <div className="flex items-center gap-1 px-4 pt-2 pb-0 border-b border-slate-800 bg-slate-900/40 shrink-0">
                <div className="flex items-center gap-0.5">
                    {SUB_TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setSubTab(t.id)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
                                subTab === t.id
                                    ? "border-amber-500 text-amber-400"
                                    : "border-transparent text-slate-500 hover:text-slate-300",
                            )}
                        >
                            {t.icon}
                            {t.label}
                        </button>
                    ))}
                </div>
                <div className="ml-auto mb-1">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-700 bg-slate-800/60 px-2 py-1 rounded">
                        Invoke Tester
                    </span>
                </div>
            </div>

            {/* Content */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
                {subTab === 'lambda' && <LambdaInvoker />}
                {subTab === 'sfn'    && <SfnInvoker />}
                {subTab === 'api'    && <ApiInvoker />}
            </div>
        </div>
    );
}
