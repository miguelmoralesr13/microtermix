import { useState } from 'react';
import { useApiGatewayStore } from '../../stores/apiGatewayStore';
import { ApiGatewayList } from './ApiGatewayList';
import { ApiResourcesTree } from './ApiResourcesTree';
import { ApiTesterView } from './ApiTesterView';
import { Search, Globe, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';

export function ApiInvoker() {
    const { testerEndpoint } = useApiGatewayStore();
    const [search, setSearch] = useState('');

    return (
        <div className="flex h-full w-full overflow-hidden bg-slate-950">
            {/* Column 1: API List */}
            <div className="w-[300px] shrink-0 border-r border-slate-800 flex flex-col bg-slate-900/20">
                <div className="p-4 border-b border-slate-800 space-y-3 shrink-0">
                    <div className="flex items-center gap-2">
                        <Globe size={16} className="text-microtermix-neon" />
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-white">APIs</h3>
                    </div>
                    <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <Input 
                            placeholder="Buscar API..." 
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="h-8 pl-9 bg-slate-950 border-slate-800 text-xs focus:border-microtermix-neon/40"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-hidden">
                    <ApiGatewayList searchTerm={search} />
                </div>
            </div>

            {/* Column 2: Resource Tree */}
            <div className="w-[350px] shrink-0 border-r border-slate-800 flex flex-col bg-slate-900/10">
                <div className="p-4 border-b border-slate-800 flex items-center gap-2 shrink-0 h-[89px]">
                    <ChevronRight size={16} className="text-slate-500" />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Endpoints</h3>
                </div>
                <div className="flex-1 overflow-hidden">
                    <ApiResourcesTree simple={true} />
                </div>
            </div>

            {/* Column 3: Tester View */}
            <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
                {testerEndpoint ? (
                    <ApiTesterView endpoint={testerEndpoint} showClose={false} />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-800 opacity-20 gap-4">
                        <Globe size={64} strokeWidth={1} />
                        <div className="text-center space-y-1">
                            <p className="text-xs font-black uppercase tracking-[0.2em]">Tester unificado</p>
                            <p className="text-[10px]">Selecciona un endpoint para comenzar la prueba</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
