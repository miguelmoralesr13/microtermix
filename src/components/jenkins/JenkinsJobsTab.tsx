import { useState } from 'react';
import { Search, X, RefreshCw, Star, AlertTriangle, Loader2, Settings } from 'lucide-react';
import { useJenkinsJobs } from '../../hooks/useJenkins';
import { useJenkinsStore } from '../../stores/jenkinsStore';
import { JenkinsJobRow } from './JenkinsJobRow';
import { LogTarget } from './JenkinsLogViewer';
import { jobMatchesSearch, isBuilding } from '../../services/jenkinsApi';
import { useQueryClient } from '@tanstack/react-query';

export function JenkinsJobsTab({ onOpenLog }: { onOpenLog: (target: LogTarget) => void }) {
    const queryClient = useQueryClient();
    const activeAccountId = useJenkinsStore(s => s.activeAccountId);
    const config = useJenkinsStore(s => s.accounts.find(a => a.id === activeAccountId));
    const favorites = useJenkinsStore(s => s.favorites);

    const [inputValue, setInputValue] = useState('');
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'favorites'>('all');

    const { data: jobs, isLoading, error, isFetching } = useJenkinsJobs();

    const handleSearch = () => setSearch(inputValue);
    const handleClear = () => { setInputValue(''); setSearch(''); };

    const filteredJobs = jobs?.filter(j => jobMatchesSearch(j, search)) || [];
    const favoriteList = Object.values(favorites).filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()));

    // Calcule running count from both visible jobs AND favorites
    const runningInList = jobs?.filter(isBuilding).length || 0;
    const runningInFavs = favoriteList.filter(f => !jobs?.some(j => j.url === f.url) && isBuilding(f as any)).length;
    const runningCount = runningInList + runningInFavs;

    const handleFullRefresh = () => {
        queryClient.invalidateQueries({ queryKey: ['jenkins'] });
    };

    if (!config || !config.baseUrl) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <Settings size={40} className="text-slate-700 mb-4" />
                <h3 className="text-slate-300 font-medium mb-2">Jenkins Not Configured</h3>
                <p className="text-slate-500 text-xs max-w-xs mb-6 leading-relaxed">
                    Please configure an account in the settings tab to view jobs.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 shrink-0 flex-wrap gap-y-1.5">
                <div className="flex items-center rounded-md border border-slate-700 overflow-hidden shrink-0">
                    <button
                        onClick={() => setFilter('all')}
                        className={`px-3 py-1 text-xs transition-colors ${filter === 'all' ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setFilter('favorites')}
                        className={`flex items-center gap-1 px-3 py-1 text-xs border-l border-slate-700 transition-colors ${filter === 'favorites' ? 'bg-slate-700 text-amber-400' : 'text-slate-500 hover:text-amber-400'}`}
                    >
                        <Star size={10} className={filter === 'favorites' ? 'fill-current' : ''} />
                        {Object.keys(favorites).length > 0 && <span>{Object.keys(favorites).length}</span>}
                    </button>
                </div>

                <div className="relative flex-1 min-w-32">
                    <Search size={12} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${isFetching ? 'text-microtermix-neon animate-pulse' : 'text-slate-500'}`} />
                    <input
                        className="w-full bg-slate-800 border border-slate-700 rounded-md pl-7 pr-16 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-microtermix-neon/50"
                        placeholder="Search jobs..."
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {inputValue && <button onClick={handleClear} className="text-slate-500 hover:text-slate-300"><X size={11} /></button>}
                        <button onClick={handleFullRefresh} className="text-slate-500 hover:text-microtermix-neon transition-colors">
                            <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {runningCount > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-microtermix-neon font-mono shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-microtermix-neon animate-pulse" />
                        {runningCount} running
                    </span>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {error && (
                    <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2 mb-4">
                        <AlertTriangle size={13} /> Failed to load jobs
                    </div>
                )}

                {filter === 'favorites' ? (
                    favoriteList.length === 0 ? (
                        <div className="text-center text-xs text-slate-500 py-16">No favorites match your search.</div>
                    ) : (
                        favoriteList.map(fav => (
                            <JenkinsJobRow key={fav.url} job={fav as any} onOpenLog={onOpenLog} search={search} />
                        ))
                    )
                ) : (
                    <>
                        {isLoading && jobs === undefined ? (
                            <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-16">
                                <Loader2 size={16} className="animate-spin" /> Loading jobs…
                            </div>
                        ) : filteredJobs.length === 0 ? (
                            <div className="text-center text-sm text-slate-500 py-16">No jobs found.</div>
                        ) : (
                            filteredJobs.map(job => (
                                <JenkinsJobRow key={job.url} job={job} onOpenLog={onOpenLog} search={search} />
                            ))
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
