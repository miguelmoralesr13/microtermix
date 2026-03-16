import React from 'react';
import { useSfnStore } from '../../stores/sfnStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

export const SfnMachineSelector: React.FC = () => {
  const { 
    machines, 
    selectedMachineArn, 
    selectMachine, 
    loadingMachines, 
    errorMachines,
    fetchMachines
  } = useSfnStore();

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
          {errorMachines}
        </Badge>
        <Button 
          variant="outline" 
          size="sm" 
          className="h-7 text-[10px]" 
          onClick={() => fetchMachines(true)}
        >
          <RefreshCw className="h-3 w-3 mr-1" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Select value={selectedMachineArn || ''} onValueChange={(val) => val && selectMachine(val)}>
        <SelectTrigger className="w-full bg-slate-900 border-slate-700 text-xs h-9">
          <SelectValue placeholder="Select a State Machine" />
        </SelectTrigger>
        <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
          {machines.map((m) => (
            <SelectItem key={m.arn} value={m.arn} className="text-xs focus:bg-slate-800 focus:text-white">
              <div className="flex flex-col">
                <span className="font-medium">{m.name}</span>
                <span className="text-[10px] text-slate-500 truncate max-w-[200px]">{m.arn}</span>
              </div>
            </SelectItem>
          ))}
          {machines.length === 0 && (
            <div className="p-2 text-xs text-slate-500 italic">No state machines found</div>
          )}
        </SelectContent>
      </Select>
      
      {machines.length > 0 && (
        <div className="flex justify-end">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 px-2 text-[10px] text-slate-400 hover:text-white"
            onClick={() => fetchMachines(true)}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${loadingMachines ? 'animate-spin' : ''}`} /> 
            Refresh list
          </Button>
        </div>
      )}
    </div>
  );
};
