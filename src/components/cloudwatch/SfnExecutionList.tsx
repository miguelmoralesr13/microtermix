import React from 'react';
import { useSfnStore, SfnExecution } from '../../stores/sfnStore';
import { Badge } from '../ui/badge';
import { Loader2, AlertCircle, History, Play } from 'lucide-react';
import { format } from 'date-fns';

export const SfnExecutionList: React.FC = () => {
  const { 
    executions, 
    selectedExecutionArn, 
    selectExecution, 
    loadingExecutions, 
    errorExecutions,
    selectedMachineArn
  } = useSfnStore();

  const getStatusBadge = (status: SfnExecution['status']) => {
    switch (status) {
      case 'SUCCEEDED':
        return <Badge variant="default" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] py-0">SUCCEEDED</Badge>;
      case 'FAILED':
        return <Badge variant="destructive" className="bg-rose-500/10 text-rose-400 border-rose-500/20 text-[10px] py-0">FAILED</Badge>;
      case 'RUNNING':
        return <Badge variant="secondary" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px] py-0">RUNNING</Badge>;
      default:
        return <Badge variant="outline" className="text-slate-400 border-slate-700 text-[10px] py-0">{status}</Badge>;
    }
  };

  if (!selectedMachineArn) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-slate-500">
        <Play size={32} className="mb-4 opacity-20" />
        <p className="text-xs text-center italic">Select a state machine to view executions</p>
      </div>
    );
  }

  if (loadingExecutions && executions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <Loader2 className="h-6 w-6 animate-spin text-microtermix-neon mb-4" />
        <p className="text-xs text-slate-400">Loading executions...</p>
      </div>
    );
  }

  if (errorExecutions) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/20 border border-red-900/50 p-3 rounded-md">
          <AlertCircle size={14} />
          {errorExecutions}
        </div>
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-slate-500">
        <History size={32} className="mb-4 opacity-20" />
        <p className="text-xs text-center italic">No executions found for this machine</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
        Recent Executions
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs text-left">
          <thead className="sticky top-0 bg-slate-900/90 backdrop-blur-sm shadow-sm z-10 border-b border-slate-800">
            <tr>
              <th className="px-4 py-2 font-medium text-slate-400">Name / Status</th>
              <th className="px-4 py-2 font-medium text-slate-400">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {executions.map((e) => (
              <tr 
                key={e.executionArn} 
                onClick={() => selectExecution(e.executionArn)}
                className={`cursor-pointer transition-colors hover:bg-slate-800/40 ${
                  selectedExecutionArn === e.executionArn ? 'bg-microtermix-neon/10 border-l-2 border-l-microtermix-neon' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-slate-200 truncate max-w-[150px]" title={e.name}>
                      {e.name}
                    </span>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(e.status)}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-500 tabular-nums">
                  {format(e.startDate, 'MMM d, HH:mm:ss')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
