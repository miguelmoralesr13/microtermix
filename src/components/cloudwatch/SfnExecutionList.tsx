import React from 'react';
import { useSfnStore, SfnExecution } from '../../stores/sfnStore';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Loader2, AlertCircle, History, Play, ExternalLink, Info } from 'lucide-react';
import { format } from 'date-fns';
import { useCwStore } from '../../stores/cwStore';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useSfnExecutions, useSfnMachines, useSfnDefinition } from '../../hooks/queries/useSfnQueries';

export const SfnExecutionList: React.FC = () => {
  const { 
    selectedExecutionArn, 
    setSelectedExecutionArn, 
    selectedMachineArn,
  } = useSfnStore();

  const { data: machines = [] } = useSfnMachines();
  const selectedMachine = machines.find(m => m.arn === selectedMachineArn);
  const { data: definitionData } = useSfnDefinition(selectedMachineArn);
  
  const { 
    data: executions = [], 
    isLoading: loadingExecutions, 
    error: errorExecutions 
  } = useSfnExecutions(
    selectedMachineArn, 
    selectedMachine?.machineType, 
    definitionData?.logGroupName
  );

  const { goToLogs } = useCwStore();
  const { setActiveView } = useWorkspace();

  const isExpress = selectedMachine?.machineType.includes('EXPRESS');

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

  // Si tenemos ejecuciones, las mostramos SIEMPRE
  if (executions.length > 0) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800 flex justify-between items-center">
          <span>Recent Executions {isExpress && <span className="text-blue-400 ml-1">(From Logs)</span>}</span>
          {loadingExecutions && <Loader2 size={10} className="animate-spin text-microtermix-neon" />}
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
                  onClick={() => setSelectedExecutionArn(e.executionArn)}
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
  }

  if (errorExecutions) {
    const errorStr = String(errorExecutions);
    const isExpressError = errorStr.includes("EXPRESS") || errorStr.includes("StateMachineTypeNotSupported") || errorStr.includes("Log Group");
    
    if (isExpressError && selectedMachine) {
      return (
        <div className="p-4 flex flex-col gap-4">
          <div className="flex flex-col gap-3 p-4 rounded-lg bg-blue-500/5 border border-blue-500/20 text-blue-400">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
              <Info size={14} />
              Express Workflow
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              This workflow requires **CloudWatch Logging** to show execution history.
            </p>
            
            <div className="space-y-2 mt-1">
               <div className="flex items-center gap-2 text-[10px] text-slate-300">
                  <div className="w-1 h-1 rounded-full bg-blue-400" />
                  Go to AWS Console
               </div>
               <div className="flex items-center gap-2 text-[10px] text-slate-300">
                  <div className="w-1 h-1 rounded-full bg-blue-400" />
                  Edit State Machine → Logging
               </div>
               <div className="flex items-center gap-2 text-[10px] text-slate-300">
                  <div className="w-1 h-1 rounded-full bg-blue-400" />
                  Set Level to <span className="text-blue-300 font-bold">ALL</span>
               </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-8 text-[10px] border-blue-500/30 text-blue-300 hover:bg-blue-500/10"
              onClick={() => {
                const actualLogGroup = definitionData?.logGroupName || `/aws/vendedlogs/states/${selectedMachine.name}-Logs`;
                goToLogs(actualLogGroup);
                setActiveView('cloudwatch');
              }}
            >
              <ExternalLink size={12} className="mr-1.5" />
              Check Log Group Manually
            </Button>

            {loadingExecutions && (
              <div className="flex items-center gap-2 text-[10px] text-blue-400/70 border-t border-blue-500/10 pt-3">
                <Loader2 size={10} className="animate-spin" />
                Searching logs for executions...
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="p-4 flex flex-col gap-4">
        <div className="flex items-start gap-2 text-xs p-3 rounded-md border text-red-400 bg-red-950/20 border-red-900/50">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{errorStr}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-slate-500">
      <History size={32} className="mb-4 opacity-20" />
      <p className="text-xs text-center italic">No executions found for this machine</p>
    </div>
  );
};
