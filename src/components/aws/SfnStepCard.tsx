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
  Check,
  GitBranch,
  Layers,
  Diff
} from 'lucide-react';
import { useCwStore } from '../../stores/cwStore';
import { useSfnStore } from '../../stores/sfnStore';
import { cn } from '@/lib/utils';
import { useWorkspace } from '../../context/WorkspaceContext';
import { toast } from 'sonner';
import { Button } from '../ui/button';

interface SfnStepCardProps {
  step: SfnStep;
  isFirst?: boolean;
  isLast?: boolean;
  prevOutput?: string;
}

// ─── JSON Utilities ──────────────────────────────────────────────────────────

const smartParse = (val: any): any => {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed === 'string') return smartParse(parsed);
      return parsed;
    } catch {
      return val;
    }
  }
  return val;
};

const prettyJson = (raw?: string): string | null => {
  if (!raw) return null;
  try {
    const parsed = smartParse(raw);
    if (typeof parsed === 'string') {
      try { return JSON.stringify(JSON.parse(parsed), null, 2); } catch { return parsed; }
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
};

interface DiffResult {
  added: Record<string, any>;
  removed: Record<string, any>;
  changed: Record<string, { from: any; to: any }>;
  hasDiff: boolean;
}

const computeShallowDiff = (fromRaw?: string, toRaw?: string): DiffResult | null => {
  if (!fromRaw || !toRaw) return null;
  try {
    const from = smartParse(fromRaw);
    const to = smartParse(toRaw);
    if (
      typeof from !== 'object' || typeof to !== 'object' ||
      Array.isArray(from) || Array.isArray(to) ||
      from === null || to === null
    ) return null;

    const added: Record<string, any> = {};
    const removed: Record<string, any> = {};
    const changed: Record<string, { from: any; to: any }> = {};

    const allKeys = new Set([...Object.keys(from), ...Object.keys(to)]);
    for (const key of allKeys) {
      if (!(key in from)) { added[key] = to[key]; }
      else if (!(key in to)) { removed[key] = from[key]; }
      else if (JSON.stringify(from[key]) !== JSON.stringify(to[key])) {
        changed[key] = { from: from[key], to: to[key] };
      }
    }

    const hasDiff =
      Object.keys(added).length > 0 ||
      Object.keys(removed).length > 0 ||
      Object.keys(changed).length > 0;

    return { added, removed, changed, hasDiff };
  } catch {
    return null;
  }
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const JsonBlock: React.FC<{ label: string; content?: string; colorClass?: string }> = ({
  label, content, colorClass = 'text-slate-300'
}) => {
  const [copied, setCopied] = useState(false);
  const formattedContent = React.useMemo(() => prettyJson(content), [content]);

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

const fmtVal = (v: any): string => {
  if (v === null)      return 'null';
  if (v === undefined) return '';
  if (typeof v === 'string') return `"${v}"`;
  return JSON.stringify(v, null, 2);
};

// One key entry in the diff
const DiffKey: React.FC<{
  keyName: string;
  oldVal?: any;
  newVal?: any;
  kind: 'added' | 'removed' | 'changed';
}> = ({ keyName, oldVal, newVal, kind }) => {
  const badge = {
    added:   { text: 'ADDED',   cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    removed: { text: 'REMOVED', cls: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
    changed: { text: 'CHANGED', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  }[kind];

  const borderCls = {
    added:   'border-l-emerald-500/50',
    removed: 'border-l-rose-500/50',
    changed: 'border-l-amber-500/50',
  }[kind];

  return (
    <div className={cn('border-l-2 pl-3 space-y-1.5', borderCls)}>
      {/* Key name + badge */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-slate-200 font-semibold">{keyName}</span>
        <span className={cn('text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border', badge.cls)}>
          {badge.text}
        </span>
      </div>

      {/* Value(s) */}
      {kind === 'changed' ? (
        <div className="space-y-1">
          <div className="text-[9px] text-slate-600 uppercase tracking-wider font-semibold">Before</div>
          <pre className="p-2 bg-rose-950/20 border border-rose-900/30 rounded font-mono text-[10px] text-rose-300/70 max-h-[150px] overflow-auto whitespace-pre-wrap break-all scrollbar-thin scrollbar-thumb-slate-800">
            {fmtVal(oldVal)}
          </pre>
          <div className="text-[9px] text-slate-600 uppercase tracking-wider font-semibold">After</div>
          <pre className="p-2 bg-emerald-950/20 border border-emerald-900/30 rounded font-mono text-[10px] text-emerald-300/80 max-h-[150px] overflow-auto whitespace-pre-wrap break-all scrollbar-thin scrollbar-thumb-slate-800">
            {fmtVal(newVal)}
          </pre>
        </div>
      ) : (
        <pre className={cn(
          'p-2 rounded font-mono text-[10px] max-h-[150px] overflow-auto whitespace-pre-wrap break-all scrollbar-thin scrollbar-thumb-slate-800',
          kind === 'added'
            ? 'bg-emerald-950/20 border border-emerald-900/30 text-emerald-300/80'
            : 'bg-rose-950/20 border border-rose-900/30 text-rose-300/70'
        )}>
          {fmtVal(kind === 'added' ? newVal : oldVal)}
        </pre>
      )}
    </div>
  );
};

const DiffBlock: React.FC<{
  label: string;
  diff: DiffResult | null;
  fallbackRaw?: string;
  colorClass?: string;
}> = ({ label, diff, fallbackRaw, colorClass }) => {
  if (!diff) {
    return <JsonBlock label={label} content={fallbackRaw} colorClass={colorClass} />;
  }

  // No changes — compact single line
  if (!diff.hasDiff) {
    return (
      <div className="flex-1 min-w-0 flex items-center gap-2 py-1">
        <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{label}</div>
        <span className="text-[10px] text-slate-700 italic">· unchanged</span>
      </div>
    );
  }

  const addedEntries   = Object.entries(diff.added);
  const removedEntries = Object.entries(diff.removed);
  const changedEntries = Object.entries(diff.changed);

  return (
    <div className="flex-1 min-w-0 space-y-2">
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</div>
      <div className="flex flex-col gap-3 max-h-[380px] overflow-auto scrollbar-thin scrollbar-thumb-slate-800 pr-1">
        {addedEntries.map(([k, v]) => (
          <DiffKey key={k} keyName={k} newVal={v} kind="added" />
        ))}
        {removedEntries.map(([k, v]) => (
          <DiffKey key={k} keyName={k} oldVal={v} kind="removed" />
        ))}
        {changedEntries.map(([k, v]) => (
          <DiffKey key={k} keyName={k} oldVal={v.from} newVal={v.to} kind="changed" />
        ))}
      </div>
    </div>
  );
};

// ─── Main Card ───────────────────────────────────────────────────────────────

export const SfnStepCard: React.FC<SfnStepCardProps> = ({
  step, isFirst, isLast, prevOutput
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [showFull, setShowFull] = useState(false);
  const { goToLogs } = useCwStore();
  const { setActiveView } = useWorkspace();
  const { setSelectedMachineArn } = useSfnStore();

  const getStatusIcon = () => {
    switch (step.status) {
      case 'succeeded': return <CheckCircle2 size={16} className="text-emerald-500" />;
      case 'failed':    return <XCircle size={16} className="text-rose-500" />;
      case 'running':   return <Circle size={16} className="text-blue-500 animate-pulse" />;
      default:          return <Circle size={16} className="text-slate-600" />;
    }
  };

  const handleGoToLogs = (e: React.MouseEvent) => {
    e.stopPropagation();
    let arn = step.lambdaArn;
    if (!arn && step.input) {
      try {
        const p = JSON.parse(step.input);
        arn = p.Parameters?.FunctionName || p.FunctionName;
      } catch {}
    }
    if (!arn) return;
    const functionName = arn.split(':').pop();
    if (functionName) { goToLogs(`/aws/lambda/${functionName}`); setActiveView('cloudwatch'); }
  };

  const handleGoToSfn = (e: React.MouseEvent, sfnArn: string) => {
    e.stopPropagation();
    setSelectedMachineArn(sfnArn);
  };

  const formatDuration = (ms?: number) => {
    if (ms === undefined) return '';
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
  };

  const detectedLambdaArn = React.useMemo(() => {
    if (step.lambdaArn) return step.lambdaArn;
    if (!step.input) return null;
    try {
      const p = JSON.parse(step.input);
      return p.Parameters?.FunctionName || p.FunctionName || null;
    } catch { return null; }
  }, [step.lambdaArn, step.input]);

  const detectedSfnArn = React.useMemo(() => {
    if (!step.input) return null;
    try {
      const p = JSON.parse(step.input);
      return p.Parameters?.StateMachineArn || p.StateMachineArn || null;
    } catch { return null; }
  }, [step.input]);

  const inputDiff  = React.useMemo(() => computeShallowDiff(prevOutput, step.input),  [prevOutput, step.input]);
  const outputDiff = React.useMemo(() => computeShallowDiff(step.input, step.output), [step.input, step.output]);

  return (
    <div className="flex gap-4">
      {/* Connector line */}
      <div className="flex flex-col items-center shrink-0">
        <div className={`w-0.5 flex-1 ${isFirst ? 'bg-transparent' : 'bg-slate-800'}`} />
        <div className="my-1 shrink-0">{getStatusIcon()}</div>
        <div className={`w-0.5 flex-1 ${isLast ? 'bg-transparent' : 'bg-slate-800'}`} />
      </div>

      {/* Card */}
      <div className={cn(
        'flex-1 bg-slate-900/40 border-y border-r border-slate-800 rounded-lg overflow-hidden transition-all hover:border-slate-700 border-l-3',
        isOpen ? 'ring-1 ring-slate-700 bg-slate-900/60' : '',
        detectedLambdaArn ? 'border-l-microtermix-neon/60 bg-microtermix-neon/2' :
        detectedSfnArn    ? 'border-l-amber-500/60 bg-amber-500/2' :
                            'border-l-slate-800'
      )}>
        {/* Header */}
        <div
          className="p-3 flex items-center justify-between gap-3 cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
        >
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
            {detectedLambdaArn && (
              <button
                onClick={handleGoToLogs}
                className="flex items-center gap-1.5 px-2 py-1 bg-microtermix-neon/10 border border-microtermix-neon/30 rounded text-[9px] font-bold text-microtermix-neon hover:bg-microtermix-neon hover:text-slate-950 transition-all shadow-sm"
                title="Ir a Logs de CloudWatch"
              >
                <Terminal size={12} />LOGS
              </button>
            )}
            {detectedSfnArn && (
              <button
                onClick={(e) => handleGoToSfn(e, String(detectedSfnArn))}
                className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-[9px] font-bold text-amber-500 hover:bg-amber-500 hover:text-slate-950 transition-all shadow-sm"
                title="Ir a Step Function Anidada"
              >
                <GitBranch size={12} />SUB-SFN
              </button>
            )}
            {isOpen
              ? <ChevronDown size={14} className="text-slate-500" />
              : <ChevronRight size={14} className="text-slate-500" />
            }
          </div>
        </div>

        {/* Body */}
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

            {/* View mode toggle */}
            <div className="flex items-center justify-between mt-2">
              <span className="text-[9px] text-slate-600 uppercase tracking-widest font-bold">
                {showFull ? 'Full State' : 'Changes'}
              </span>
              <Button
                variant="ghost"
                size="xs"
                className="h-5 px-2 text-[9px] text-slate-500 hover:text-slate-200 gap-1"
                onClick={(e) => { e.stopPropagation(); setShowFull(v => !v); }}
              >
                {showFull
                  ? <><Diff size={9} />Show Changes</>
                  : <><Layers size={9} />Full State</>
                }
              </Button>
            </div>

            {/* JSON panels */}
            <div className="flex flex-col md:flex-row gap-3">
              {showFull ? (
                <>
                  <JsonBlock label="Input" content={step.input} />
                  <JsonBlock
                    label="Output"
                    content={step.output}
                    colorClass={step.status === 'failed' ? 'text-rose-300/60 italic' : 'text-emerald-300/80'}
                  />
                </>
              ) : (
                <>
                  <DiffBlock
                    label={prevOutput ? 'Input Changes' : 'Input'}
                    diff={prevOutput ? inputDiff : null}
                    fallbackRaw={step.input}
                  />
                  <DiffBlock
                    label="Output Changes"
                    diff={outputDiff}
                    fallbackRaw={step.output}
                    colorClass={step.status === 'failed' ? 'text-rose-300/60 italic' : 'text-emerald-300/80'}
                  />
                </>
              )}
            </div>

            {detectedSfnArn && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/30">
                <div className="text-[9px] text-slate-600 truncate max-w-[80%] font-mono" title={String(detectedSfnArn)}>
                  Nested SFN: {String(detectedSfnArn)}
                </div>
                <button
                  onClick={(e) => handleGoToSfn(e, String(detectedSfnArn))}
                  className="flex items-center gap-1 text-[10px] text-amber-500 hover:text-amber-500/80 hover:underline transition-colors"
                >
                  View Sub-StepFunction <ExternalLink size={10} />
                </button>
              </div>
            )}

            {detectedLambdaArn && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/30">
                <div className="text-[9px] text-slate-600 truncate max-w-[80%] font-mono" title={String(detectedLambdaArn)}>
                  Resource: {String(detectedLambdaArn)}
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
