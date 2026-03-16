import React, { useState } from 'react';
import { SfnStep } from '../../stores/sfnStore';
import { 
  ChevronDown, 
  ChevronRight, 
  Terminal, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Circle,
  ExternalLink
} from 'lucide-react';
import { useCwStore } from '../../stores/cwStore';
import { useWorkspace } from '../../context/WorkspaceContext';

interface SfnStepCardProps {
  step: SfnStep;
  isFirst?: boolean;
  isLast?: boolean;
}

export const SfnStepCard: React.FC<SfnStepCardProps> = ({ step, isFirst, isLast }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { goToLogs } = useCwStore();
  const { setActiveView } = useWorkspace();

  const getStatusIcon = () => {
    switch (step.status) {
      case 'succeeded':
        return <CheckCircle2 size={16} className="text-emerald-500" />;
      case 'failed':
        return <XCircle size={16} className="text-rose-500" />;
      case 'running':
        return <Circle size={16} className="text-blue-500 animate-pulse" />;
      default:
        return <Circle size={16} className="text-slate-600" />;
    }
  };

  const handleGoToLogs = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!step.lambdaArn) return;
    
    const functionName = step.lambdaArn.split(':').pop();
    if (functionName) {
        const logGroup = `/aws/lambda/${functionName}`;
        goToLogs(logGroup);
        setActiveView('cloudwatch');
    }
  };

  const formatDuration = (ms?: number) => {
    if (ms === undefined) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="flex gap-4">
      {/* Connector Line */}
      <div className="flex flex-col items-center shrink-0">
        <div className={`w-0.5 flex-1 ${isFirst ? 'bg-transparent' : 'bg-slate-800'}`} />
        <div className="my-1">{getStatusIcon()}</div>
        <div className={`w-0.5 flex-1 ${isLast ? 'bg-transparent' : 'bg-slate-800'}`} />
      </div>

      {/* Card */}
      <div 
        className={`flex-1 bg-slate-900/40 border border-slate-800 rounded-lg overflow-hidden transition-all hover:border-slate-700 cursor-pointer ${
          isOpen ? 'ring-1 ring-slate-700' : ''
        }`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`font-medium text-xs ${step.status === 'failed' ? 'text-rose-400' : 'text-slate-200'}`}>
              {step.name}
            </span>
            {step.durationMs !== undefined && (
              <span className="flex items-center gap-1 text-[10px] text-slate-500 tabular-nums">
                <Clock size={10} />
                {formatDuration(step.durationMs)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {step.lambdaArn && (
              <button 
                onClick={handleGoToLogs}
                className="p-1.5 text-slate-500 hover:text-microtermix-neon hover:bg-slate-800 rounded transition-colors"
                title="View Lambda Logs"
              >
                <Terminal size={14} />
              </button>
            )}
            {isOpen ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
          </div>
        </div>

        {isOpen && (
          <div className="px-3 pb-3 border-t border-slate-800/50 bg-slate-950/30 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
            {step.error && (
              <div className="mt-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded text-[11px] text-rose-400">
                <div className="font-bold uppercase tracking-wider text-[9px] mb-1">Error: {step.error}</div>
                <div className="opacity-80">{step.cause}</div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Input</div>
                <pre className="p-2 bg-slate-950 border border-slate-800 rounded font-mono text-[10px] text-slate-300 overflow-auto max-h-[200px] whitespace-pre-wrap break-all">
                  {step.input}
                </pre>
              </div>
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Output</div>
                <pre className={`p-2 bg-slate-950 border border-slate-800 rounded font-mono text-[10px] overflow-auto max-h-[200px] whitespace-pre-wrap break-all ${
                    step.status === 'failed' ? 'text-rose-300/50 italic' : 'text-emerald-300/80'
                }`}>
                  {step.output || (step.status === 'running' ? 'Still running...' : 'No output')}
                </pre>
              </div>
            </div>

            {step.lambdaArn && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/30">
                    <div className="text-[9px] text-slate-600 truncate max-w-[80%]" title={step.lambdaArn}>
                        Resource: {step.lambdaArn}
                    </div>
                    <button 
                        onClick={handleGoToLogs}
                        className="flex items-center gap-1 text-[10px] text-microtermix-neon hover:underline"
                    >
                        View CloudWatch Logs <ExternalLink size={10} />
                    </button>
                </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
