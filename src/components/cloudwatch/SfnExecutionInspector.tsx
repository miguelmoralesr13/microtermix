import React, { useState, useEffect } from 'react';
import { useSfnStore } from '../../stores/sfnStore';
import { SfnStepCard } from './SfnStepCard';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { 
  Play, 
  RotateCcw, 
  Loader2, 
  AlertCircle, 
  ChevronRight,
  Code,
  History as HistoryIcon
} from 'lucide-react';
import { Badge } from '../ui/badge';

export const SfnExecutionInspector: React.FC = () => {
  const { 
    steps, 
    selectedExecutionArn, 
    loadingHistory, 
    errorHistory,
    startExecution,
    selectedMachineArn,
    executions
  } = useSfnStore();

  const [editMode, setEditMode] = useState(false);
  const [editedInput, setEditedInput] = useState('');

  // Auto-fill input from the first step when selected
  useEffect(() => {
    if (steps.length > 0 && steps[0].input) {
      setEditedInput(steps[0].input);
    }
  }, [steps]);

  const handleRestart = async () => {
    if (!selectedMachineArn) return;
    try {
        // Validate JSON
        JSON.parse(editedInput);
        await startExecution(selectedMachineArn, editedInput);
        setEditMode(false);
    } catch (e) {
        alert('Invalid JSON input');
    }
  };

  const selectedExecution = executions.find(e => e.executionArn === selectedExecutionArn);

  if (!selectedExecutionArn) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-slate-500 bg-slate-950">
        <div className="w-16 h-16 rounded-full border border-slate-800 flex items-center justify-center mb-6">
          <ChevronRight size={32} className="opacity-20" />
        </div>
        <p className="text-sm font-medium">No execution selected</p>
        <p className="text-xs text-slate-600 mt-2 italic text-center max-w-[200px]">
          Select an execution from the list to inspect its history and data flow.
        </p>
      </div>
    );
  }

  if (loadingHistory) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-microtermix-neon mb-4" />
        <p className="text-xs text-slate-400">Loading execution history...</p>
      </div>
    );
  }

  if (errorHistory) {
    return (
      <div className="p-8 bg-slate-950 h-full">
        <div className="flex flex-col items-center gap-4 text-xs text-red-400 bg-red-950/20 border border-red-900/50 p-6 rounded-md max-w-md mx-auto">
          <AlertCircle size={32} />
          <p className="text-center font-medium">{errorHistory}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/20 flex items-center justify-between shrink-0">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white truncate max-w-[300px]" title={selectedExecution?.name}>
              {selectedExecution?.name}
            </h2>
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 tabular-nums text-slate-500 border-slate-800">
              {steps.length} steps
            </Badge>
          </div>
          <p className="text-[10px] text-slate-500 truncate font-mono">{selectedExecutionArn}</p>
        </div>
        
        <div className="flex items-center gap-2">
           <Button 
            variant={editMode ? 'default' : 'outline'} 
            size="sm" 
            className={`h-8 text-xs ${editMode ? 'bg-microtermix-neon text-slate-950' : 'text-slate-300 border-slate-700'}`}
            onClick={() => setEditMode(!editMode)}
          >
            <RotateCcw className="h-3 w-3 mr-1.5" />
            Edit & Restart
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 flex gap-6">
        {/* Step Timeline */}
        <div className={`flex-1 flex flex-col gap-4 ${editMode ? 'hidden lg:flex' : 'flex'}`}>
            {steps.map((step, idx) => (
                <SfnStepCard key={`${step.name}-${idx}`} step={step} isFirst={idx === 0} isLast={idx === steps.length - 1} />
            ))}
            {steps.length === 0 && (
                <div className="flex flex-col items-center justify-center p-12 text-slate-500 bg-slate-900/10 rounded-lg border border-dashed border-slate-800">
                    <HistoryIcon size={24} className="mb-2 opacity-20" />
                    <p className="text-xs italic">No steps found for this execution</p>
                </div>
            )}
        </div>

        {/* Edit & Restart Panel */}
        {editMode && (
          <div className="w-full lg:w-[400px] shrink-0 flex flex-col bg-slate-900/50 border border-slate-800 rounded-lg p-4 animate-in slide-in-from-right-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Code size={14} className="text-microtermix-neon" />
                RESTART WITH INPUT
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500" onClick={() => setEditMode(false)}>
                <Play size={14} className="rotate-180" />
              </Button>
            </div>
            
            <p className="text-[10px] text-slate-400 mb-4">
              Modify the JSON input below to start a new execution of this state machine.
            </p>
            
            <div className="flex-1 flex flex-col gap-4">
               <Textarea 
                value={editedInput}
                onChange={(e) => setEditedInput(e.target.value)}
                className="flex-1 font-mono text-[11px] bg-slate-950 border-slate-800 text-slate-300 focus:border-microtermix-neon min-h-[300px]"
                placeholder='{ "key": "value" }'
              />
              
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="flex-1 h-9 text-slate-400" onClick={() => setEditMode(false)}>
                  Cancel
                </Button>
                <Button variant="default" size="sm" className="flex-[2] h-9 bg-microtermix-neon text-slate-950 hover:bg-microtermix-neon/90" onClick={handleRestart}>
                  <Play size={14} className="mr-2 fill-current" />
                  Launch New
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
