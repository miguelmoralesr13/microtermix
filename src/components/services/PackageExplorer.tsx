import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Package, Download, ExternalLink, Loader2, CheckCircle2, ChevronDown, Lock } from 'lucide-react';
import { marked } from 'marked';
import { RegistryManager } from '@/services/registry/RegistryManager';
import { PackageMetadata } from '@/services/registry/types';
import { Button } from '@/components//ui/button';
import { Input } from '@/components//ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface PackageExplorerProps {
  projectPath: string;
  projectType: string;
  packageManager?: string;
  onInstall?: (packageName: string, isDev: boolean, version?: string) => void;
}

export const PackageExplorer: React.FC<PackageExplorerProps> = ({ projectPath, projectType, packageManager, onInstall }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Partial<PackageMetadata>[]>([]);
  const [installedDeps, setInstalledDeps] = useState<{name: string, version: string, isDev?: boolean}[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<PackageMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const docScrollRef = useRef<HTMLDivElement>(null);

  const registryManager = RegistryManager.getInstance();
  const strategy = registryManager.getStrategyByProjectType(projectType);

  // Memoize installed status for the selected package
  const localInfo = useMemo(() => {
    if (!selectedPackage) return null;
    return installedDeps.find(d => d.name === selectedPackage.name);
  }, [selectedPackage, installedDeps]);

  const isLocal = !!localInfo;

  useEffect(() => {
    if (strategy && projectPath) {
        strategy.getLocalDependencies(projectPath).then(setInstalledDeps);
    }
  }, [strategy, projectPath]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || !strategy) return;

    setIsSearching(true);
    try {
      const results = await strategy.searchPackages(searchQuery);
      setSearchResults(results);
    } catch (error) {
      toast.error('Error searching packages');
    } finally {
      setIsSearching(false);
    }
  };

  const selectPackage = async (pkgName: string, version?: string) => {
    if (!strategy) return;

    // If it's local and we are trying to select a version DIFFERENT from the local one, 
    // we block it according to user requirements.
    const local = installedDeps.find(d => d.name === pkgName);
    const targetVersion = (local && !version) ? local.version.replace(/[\^~]/g, '') : version;

    setIsLoading(true);
    if (docScrollRef.current) docScrollRef.current.scrollTop = 0;
    
    try {
      const details = await strategy.fetchPackageInfo(pkgName, targetVersion);
      setSelectedPackage(details);
    } catch (error) {
      console.error(error);
      toast.error(`Could not load details for ${pkgName}`);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMarkdown = (content: any) => {
    const safeContent = typeof content === 'string' ? content : JSON.stringify(content);
    if (!safeContent || safeContent.trim() === '') {
        return { __html: '<div class="flex flex-col items-center justify-center py-20 text-slate-500 italic"><p>No documentation available for this version.</p></div>' };
    }
    try {
      const html = marked.parse(safeContent);
      return { __html: typeof html === 'string' ? html : '' };
    } catch (e) {
      return { __html: '<p class="text-red-400">Error parsing documentation</p>' };
    }
  };

  const handleInstall = (isDev: boolean) => {
    if (!selectedPackage || !packageManager || isLocal) return;
    onInstall?.(selectedPackage.name, isDev, selectedPackage.version);
  };

  if (!strategy) return null;

  const filteredInstalled = searchQuery 
    ? installedDeps.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : installedDeps;

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Search Header */}
      <div className="p-3 border-b border-slate-800 bg-slate-900/40 backdrop-blur-md z-20">
        <form onSubmit={handleSearch} className="flex gap-2 w-full">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter local or search registry..."
                className="pl-10 bg-slate-950 border-slate-700 focus:ring-1 focus:ring-blue-500 h-9 text-sm"
                autoFocus
            />
            {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />}
          </div>
          <Button type="submit" size="sm" className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 h-9">
            Search
          </Button>
        </form>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* Sidebar */}
        <div className="w-80 flex-col border-r border-slate-800 bg-slate-950/20 flex shrink-0">
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            {filteredInstalled.length > 0 && (
                <div className="mb-2">
                    <h3 className="px-4 py-2 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] bg-slate-900/30 sticky top-0 backdrop-blur-sm flex items-center justify-between">
                        Local
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    </h3>
                    <div className="p-1">
                        {filteredInstalled.map(pkg => (
                            <button
                                key={pkg.name}
                                onClick={() => selectPackage(pkg.name)}
                                className={cn(
                                    "w-full text-left px-3 py-2 rounded transition-all mb-0.5 flex items-center justify-between group",
                                    selectedPackage?.name === pkg.name ? "bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/30 shadow-lg" : "hover:bg-slate-900 text-slate-400"
                                )}
                            >
                                <div className="min-w-0">
                                    <div className="font-bold text-xs truncate flex items-center gap-2">
                                        {pkg.name}
                                    </div>
                                    <div className="text-[10px] opacity-50 font-mono">{pkg.version}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
            {searchResults.length > 0 && (
                <div>
                    <h3 className="px-4 py-2 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] bg-slate-900/30 sticky top-0 backdrop-blur-sm">Registry</h3>
                    <div className="p-1">
                        {searchResults.map((pkg) => (
                            <button
                                key={pkg.name}
                                onClick={() => selectPackage(pkg.name!)}
                                className={cn(
                                    "w-full text-left px-3 py-2 rounded transition-all mb-0.5 group",
                                    selectedPackage?.name === pkg.name ? "bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/30 shadow-lg" : "hover:bg-slate-900 text-slate-400"
                                )}
                            >
                                <div className="font-bold text-xs truncate">{pkg.name}</div>
                                <div className="text-[10px] opacity-50 truncate italic">{pkg.author || 'No author'}</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
          {isLoading && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-md">
              <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
              <p className="text-sm font-black text-blue-400 tracking-widest animate-pulse uppercase">Syncing</p>
            </div>
          )}

          {selectedPackage ? (
            <>
              {/* Header */}
              <div className="p-6 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between gap-10 sticky top-0 z-10">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <h2 className="text-3xl font-black text-white truncate tracking-tighter leading-none">{selectedPackage.name}</h2>
                            {isLocal && (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[10px] font-black border border-emerald-500/20 uppercase tracking-widest">
                                    Installed
                                </span>
                            )}
                        </div>
                        
                        {/* VERSION SELECTOR - Disabled if Local */}
                        <div className="relative inline-block">
                            <select 
                                disabled={isLocal}
                                value={selectedPackage.version}
                                onChange={(e) => selectPackage(selectedPackage.name, e.target.value)}
                                className={cn(
                                    "appearance-none bg-slate-800 text-blue-400 text-xs font-bold px-4 py-1.5 pr-10 rounded-full border border-slate-700 outline-none transition-all",
                                    isLocal ? "opacity-50 cursor-not-allowed border-slate-800 text-slate-500" : "cursor-pointer hover:bg-slate-700 focus:ring-2 focus:ring-blue-500/50"
                                )}
                            >
                                {isLocal ? (
                                    <option value={selectedPackage.version}>v{selectedPackage.version}</option>
                                ) : (
                                    selectedPackage.versions?.map(v => (
                                        <option key={v} value={v}>v{v}</option>
                                    ))
                                )}
                            </select>
                            {isLocal ? (
                                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
                            ) : (
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-5 mt-3 text-xs text-slate-500">
                        {selectedPackage.homepage && (
                            <a href={selectedPackage.homepage} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-bold">
                                <ExternalLink className="w-3.5 h-3.5" /> Web
                            </a>
                        )}
                        <span>License: <b className="text-slate-300">{selectedPackage.license || 'N/A'}</b></span>
                    </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {!isLocal && (
                    <>
                        <Button 
                            className="bg-blue-600 hover:bg-blue-500 text-white font-black h-12 px-8 rounded-xl shadow-xl border-b-4 border-blue-800 active:border-b-0 active:translate-y-1 transition-all"
                            onClick={() => handleInstall(false)}
                        >
                            <Download className="w-5 h-5 mr-2" />
                            Install v{selectedPackage.version}
                        </Button>
                        {strategy.id === 'npm' && (
                            <Button 
                                variant="outline"
                                className="border-slate-700 text-slate-300 hover:bg-slate-800 h-12 px-6 font-bold rounded-xl border-b-4 active:border-b-0 active:translate-y-1 transition-all"
                                onClick={() => handleInstall(true)}
                            >
                                Dev
                            </Button>
                        )}
                    </>
                  )}
                </div>
              </div>

              {/* Documentation */}
              <div 
                ref={docScrollRef}
                className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent p-10"
              >
                <div className="max-w-5xl mx-auto">
                  <div 
                    className="prose prose-invert prose-blue max-w-none 
                    prose-headings:font-black prose-headings:tracking-tighter
                    prose-h1:text-4xl prose-h1:border-b prose-h1:border-slate-800 prose-h1:pb-4
                    prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-800 prose-pre:rounded-xl
                    prose-code:text-blue-300 prose-code:bg-blue-500/5 prose-code:px-1.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none"
                    dangerouslySetInnerHTML={renderMarkdown(selectedPackage.readme)} 
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-800 select-none">
              <Package className="w-40 h-40 opacity-[0.03] mb-8" />
              <p className="text-xl font-black uppercase tracking-[0.4em] opacity-20">Select a package</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
