import React, { useMemo } from 'react';
import { useApiGatewayStore, SelectedApi } from '../stores/apiGatewayStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Server, Zap, Star } from 'lucide-react';

interface ApiGatewayListProps {
    searchTerm: string;
}

export const ApiGatewayList: React.FC<ApiGatewayListProps> = ({ searchTerm }) => {
    const { restApis, httpApis, selectedApi, selectApi, favoriteApis, toggleFavorite } = useApiGatewayStore();

    const term = searchTerm.toLowerCase().trim();

    const filteredRest = useMemo(() => {
        const favs = restApis.filter(api => favoriteApis.includes(api.id));
        const others = restApis.filter(api =>
            !favoriteApis.includes(api.id) && (
                api.name.toLowerCase().includes(term) ||
                api.id.toLowerCase().includes(term)
            )
        );
        return term ? [...favs, ...others] : [...favs, ...others.sort((a, b) => a.name.localeCompare(b.name))];
    }, [restApis, term, favoriteApis]);

    const filteredHttp = useMemo(() => {
        const favs = httpApis.filter(api => favoriteApis.includes(api.api_id));
        const others = httpApis.filter(api =>
            !favoriteApis.includes(api.api_id) && (
                api.name.toLowerCase().includes(term) ||
                api.api_id.toLowerCase().includes(term)
            )
        );
        return term ? [...favs, ...others] : [...favs, ...others.sort((a, b) => a.name.localeCompare(b.name))];
    }, [httpApis, term, favoriteApis]);

    const handleSelect = (api: SelectedApi) => {
        selectApi(api);
    };

    return (
        <div className="flex flex-col h-full w-full">
            <Tabs defaultValue="rest" className="flex flex-col h-full w-full">

                <div className="px-4 pt-3 pb-2 border-b border-slate-800 shrink-0">
                    <TabsList className="w-full bg-slate-950/50 border border-slate-800 h-9 p-1">
                        <TabsTrigger value="rest" className="flex-1 text-xs data-[state=active]:bg-slate-800">
                            v1 (REST) <Badge variant="secondary" className="ml-2 bg-slate-800 text-slate-400 font-normal px-1.5 py-0 h-4">{filteredRest.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="http" className="flex-1 text-xs data-[state=active]:bg-slate-800">
                            v2 (HTTP/WS) <Badge variant="secondary" className="ml-2 bg-slate-800 text-slate-400 font-normal px-1.5 py-0 h-4">{filteredHttp.length}</Badge>
                        </TabsTrigger>
                    </TabsList>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <TabsContent value="rest" className="m-0 h-full p-2 space-y-1 outline-none">
                        {filteredRest.length === 0 ? (
                            <div className="text-slate-500 text-sm text-center mt-10">No REST APIs found</div>
                        ) : (
                            filteredRest.map(api => {
                                const isSelected = selectedApi?.type === 'rest' && selectedApi.id === api.id;
                                const isFav = favoriteApis.includes(api.id);
                                return (
                                    <div
                                        key={api.id}
                                        onClick={() => handleSelect({ type: 'rest', id: api.id, name: api.name })}
                                        className={`flex flex-col p-3 rounded-md cursor-pointer border transition-colors ${isSelected
                                                ? 'bg-microtermix-neon/10 border-microtermix-neon border-opacity-30'
                                                : 'bg-slate-900 border-slate-800/50 hover:bg-slate-800 hover:border-slate-700'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="font-semibold text-sm flex items-center gap-2 text-slate-200 truncate pr-2">
                                                <Server size={14} className="text-emerald-400 shrink-0" />
                                                <span className="truncate">{api.name}</span>
                                            </div>
                                            <button
                                                className="shrink-0 p-0.5 rounded hover:bg-slate-700/50 transition-colors"
                                                onClick={e => { e.stopPropagation(); toggleFavorite(api.id); }}
                                                title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                                            >
                                                <Star
                                                    size={14}
                                                    className={`transition-colors ${isFav ? 'fill-amber-400 text-amber-400' : 'text-slate-600 hover:text-amber-400'}`}
                                                />
                                            </button>
                                        </div>
                                        <div className="text-xs text-slate-500 font-mono mb-2">{api.id}</div>
                                        {api.description && (
                                            <p className="text-xs text-slate-400 line-clamp-2">{api.description}</p>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </TabsContent>

                    <TabsContent value="http" className="m-0 h-full p-2 space-y-1 outline-none">
                        {filteredHttp.length === 0 ? (
                            <div className="text-slate-500 text-sm text-center mt-10">No HTTP/WebSocket APIs found</div>
                        ) : (
                            filteredHttp.map(api => {
                                const isSelected = selectedApi?.type === 'http' && selectedApi.id === api.api_id;
                                const isFav = favoriteApis.includes(api.api_id);
                                return (
                                    <div
                                        key={api.api_id}
                                        onClick={() => handleSelect({ type: 'http', id: api.api_id, name: api.name })}
                                        className={`flex flex-col p-3 rounded-md cursor-pointer border transition-colors ${isSelected
                                                ? 'bg-microtermix-neon/10 border-microtermix-neon border-opacity-30'
                                                : 'bg-slate-900 border-slate-800/50 hover:bg-slate-800 hover:border-slate-700'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="font-semibold text-sm flex items-center gap-2 text-slate-200 truncate pr-2">
                                                <Zap size={14} className="text-amber-400 shrink-0" />
                                                <span className="truncate">{api.name}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <Badge variant="outline" className="text-[10px] uppercase border-slate-700 font-mono h-5 px-1.5">{api.protocol_type}</Badge>
                                                <button
                                                    className="p-0.5 rounded hover:bg-slate-700/50 transition-colors"
                                                    onClick={e => { e.stopPropagation(); toggleFavorite(api.api_id); }}
                                                    title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                                                >
                                                    <Star
                                                        size={14}
                                                        className={`transition-colors ${isFav ? 'fill-amber-400 text-amber-400' : 'text-slate-600 hover:text-amber-400'}`}
                                                    />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="text-xs text-slate-500 font-mono mb-2">{api.api_id}</div>
                                        {api.description && (
                                            <p className="text-xs text-slate-400 line-clamp-2">{api.description}</p>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
};
