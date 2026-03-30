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
  ExternalLink,
  Copy,
  Check
} from 'lucide-react';
import { useCwStore } from '../../stores/cwStore';
import { useWorkspace } from '../../context/WorkspaceContext';
import { toast } from 'sonner';

interface SfnStepCardProps {
  step: SfnStep;
  isFirst?: boolean;
  isLast?: boolean;
}

const JsonBlock: React.FC<{ label: string; content?: string; colorClass?: string }> = ({ label, content, colorClass = 'text-slate-300' }) => {
  const [copied, setCopied] = useState(false);

  const formattedContent = React.useMemo(() => {
    if (!content) return null;
    
    const smartParse = (val: any): any => {
      if (typeof val !== 'string') return val;
      // Check if it's a stringified JSON (starts with { or [)
      const trimmed = val.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          const parsed = JSON.parse(val);
          // Recursively parse if the result is still a string (handles multiple escapes)
          if (typeof parsed === 'string') return smartParse(parsed);
          return parsed;
        } catch (e) {
          return val;
        }
      }
      return val;
    };

    try {
      const parsed = smartParse(content);
      if (typeof parsed === 'string') {
          // If it's still a string after smartParse, it might just be a regular string
          // but let's see if we can parse it as JSON anyway
          try {
              const p2 = JSON.parse(parsed);
              return JSON.stringify(p2, null, 2);
          } catch {
              return parsed;
          }
      }
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return content;
    }
  }, [content]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!formattedContent) return;
    navigator.clipboard.writeText(formattedContent);
    setCopied(true);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!content && label === 'Output') return (
    <div className="space-y-1.5 flex-1 min-w-0">
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</div>
      <div className="p-2 bg-slate-950 border border-slate-800 rounded font-mono text-[10px] text-slate-600 italic">
        No output available
      </div>
    </div>
  );

  return (
    <div className="space-y-1.5 flex-1 min-w-0 relative group">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</div>
        <button 
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-800 rounded transition-all text-slate-500 hover:text-microtermix-neon"
          title="Copy to clipboard"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
        </button>
      </div>
      <pre className={`p-2 bg-slate-950 border border-slate-800 rounded font-mono text-[10px] overflow-auto max-h-[300px] whitespace-pre-wrap break-all scrollbar-thin scrollbar-thumb-slate-800 ${colorClass}`}>
        {formattedContent}
      </pre>
    </div>
  );
};

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
        <div className="my-1 shrink-0">{getStatusIcon()}</div>
        <div className={`w-0.5 flex-1 ${isLast ? 'bg-transparent' : 'bg-slate-800'}`} />
      </div>

      {/* Card */}
      <div 
        className={`flex-1 bg-slate-900/40 border border-slate-800 rounded-lg overflow-hidden transition-all hover:border-slate-700 cursor-pointer ${
          isOpen ? 'ring-1 ring-slate-700 bg-slate-900/60' : ''
        }`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`font-medium text-xs ${step.status === 'failed' ? 'text-rose-400' : 'text-slate-200'}`}>
              {step.name}
            </span>
            {step.durationMs !== undefined && (
              <span className="flex items-center gap-1 text-[10px] text-slate-500 tabular-nums bg-slate-950/50 px-1.5 py-0.5 rounded border border-slate-800/50">
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
              <div className="mt-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded text-[11px] text-rose-400 shadow-inner">
                <div className="font-bold uppercase tracking-wider text-[9px] mb-1 flex items-center gap-1.5">
                  <XCircle size={10} />
                  Error: {step.error}
                </div>
                <div className="opacity-80 font-mono text-[10px] bg-black/20 p-1.5 rounded mt-1 border border-rose-500/10">
                  {step.cause}
                </div>
              </div>
            )}

            <div className="flex flex-col md:flex-row gap-3 mt-2">
              <JsonBlock label="Input" content={step.input} />
              <JsonBlock 
                label="Output" 
                content={step.output} 
                colorClass={step.status === 'failed' ? 'text-rose-300/60 italic' : 'text-emerald-300/80'} 
              />
            </div>

            {step.lambdaArn && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/30">
                    <div className="text-[9px] text-slate-600 truncate max-w-[80%] font-mono" title={step.lambdaArn}>
                        Resource: {step.lambdaArn}
                    </div>
                    <button 
                        onClick={handleGoToLogs}
                        className="flex items-center gap-1 text-[10px] text-microtermix-neon hover:text-microtermix-neon/80 hover:underline transition-colors"
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
