import React, { useState, useMemo } from 'react';
import { useSfnStore } from '../../stores/sfnStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Loader2, AlertCircle, RefreshCw, Search, X } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useSfnMachines, sfnKeys } from '../../hooks/queries/useSfnQueries';
import { useQueryClient } from '@tanstack/react-query';

export const SfnMachineSelector: React.FC = () => {
  const { 
    selectedMachineArn, 
    setSelectedMachineArn
  } = useSfnStore();

  const queryClient = useQueryClient();
  const { data: machines = [], isLoading: loadingMachines, error: errorMachines } = useSfnMachines();

  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('');

  const filteredMachines = useMemo(() => {
    if (!filter) return machines;
    return machines.filter(m => 
      m.name.toLowerCase().includes(filter.toLowerCase()) || 
      m.arn.toLowerCase().includes(filter.toLowerCase())
    );
  }, [machines, filter]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setFilter(searchTerm);
    }
  };

  const clearFilter = () => {
    setSearchTerm('');
    setFilter('');
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: sfnKeys.machines() });
  };

  if (loadingMachines && machines.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 p-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading state machines...
      </div>
    );
  }

  if (errorMachines) {
    return (
      <div className="flex flex-col gap-2 p-2 bg-red-950/20 border border-red-900/50 rounded-md">
        <div className="flex items-center gap-2 text-xs text-red-400">
          <AlertCircle className="h-3 w-3" />
          Error loading machines
        </div>
        <Badge variant="destructive" className="text-[10px] truncate max-w-full">
          {String(errorMachines)}
        </Badge>
        <Button 
          variant="outline" 
          size="sm" 
          className="h-7 text-[10px]" 
          onClick={handleRefresh}
        >
          <RefreshCw className="h-3 w-3 mr-1" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search Bar */}
      <div className="relative group">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 group-focus-within:text-microtermix-neon transition-colors" />
        <Input 
          placeholder="Search machine... (Enter)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-8 pl-8 pr-8 text-[11px] bg-slate-950 border-slate-800 focus:border-microtermix-neon/50 focus:ring-microtermix-neon/20 transition-all"
        />
        {searchTerm && (
          <button 
            onClick={clearFilter}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-800 rounded-full transition-colors"
          >
            <X className="h-3 w-3 text-slate-500 hover:text-white" />
          </button>
        )}
      </div>

      <div className="space-y-2">
        <Select value={selectedMachineArn || ''} onValueChange={(val) => val && setSelectedMachineArn(val)}>
          <SelectTrigger className="w-full bg-slate-900 border-slate-700 text-xs h-9">
            <SelectValue placeholder={filter ? `Results for "${filter}"` : "Select a State Machine"} />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700 text-slate-200 max-h-[400px]">
            {filteredMachines.map((m) => (
              <SelectItem key={m.arn} value={m.arn} className="text-xs focus:bg-slate-800 focus:text-white">
                <div className="flex flex-col w-full min-w-0 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate text-slate-100">{m.name}</span>
                    <Badge 
                      variant="outline" 
                      className={`text-[8px] h-4 px-1 shrink-0 ${
                        m.machineType.includes('EXPRESS') 
                          ? 'border-blue-500/30 text-blue-400 bg-blue-500/5' 
                          : 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5'
                      }`}
                    >
                      {m.machineType.includes('EXPRESS') ? 'EXPRESS' : 'STANDARD'}
                    </Badge>
                  </div>
                  <span className="text-[9px] text-slate-500 truncate max-w-[220px] font-mono mt-0.5">{m.arn}</span>
                </div>
              </SelectItem>
            ))}
            {filteredMachines.length === 0 && (
              <div className="p-4 text-xs text-slate-500 italic text-center">
                No state machines match "{filter || searchTerm}"
              </div>
            )}
          </SelectContent>
        </Select>
        
        <div className="flex justify-between items-center px-1">
          <div className="text-[9px] text-slate-600 font-medium">
            {filter ? `${filteredMachines.length} found` : `${machines.length} total`}
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 px-2 text-[10px] text-slate-400 hover:text-white"
            onClick={handleRefresh}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${loadingMachines ? 'animate-spin' : ''}`} /> 
            Refresh list
          </Button>
        </div>
      </div>
    </div>
  );
};
