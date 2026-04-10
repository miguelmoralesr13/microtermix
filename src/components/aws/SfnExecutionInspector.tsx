import React, { useState, useEffect } from 'react';
import { useSfnStore } from '../../stores/sfnStore';
import { SfnStepCard } from './SfnStepCard';
import { Button } from '../ui/button';
import {
  Play,
  RotateCcw,
  Loader2,
  AlertCircle,
  ChevronRight,
  Code,
  History as HistoryIcon,
  FileCode,
  ExternalLink,
  Info,
  ListTree,
  Terminal,
  GitBranch,
  ArrowUpDown,
  Copy,
  Check,
  Zap,
  ScrollText
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import Editor from '@monaco-editor/react';
import { useMonacoTheme } from '../../hooks/useMonacoTheme';
import { useCwStore } from '../../stores/cwStore';
import { useWorkspace } from '../../context/WorkspaceContext';
import {
  useSfnMachines, useSfnDefinition, useSfnExecutions,
  useSfnHistory, useStartSfnExecution
} from '../../hooks/queries/useSfnQueries';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '../ui/dialog';
import { extractLambdaName, extractSfnArn } from './cwUtils';
import { cn } from '../../lib/utils';

export const SfnExecutionInspector: React.FC = () => {
  const {
    selectedExecutionArn,
    selectedMachineArn,
    setSelectedMachineArn // Added this to navigate
  } = useSfnStore();

  const { data: machines = [] } = useSfnMachines();
  const selectedMachine = machines.find(m => m.arn === selectedMachineArn);

  const { data: definitionData, isLoading: loadingDefinition } = useSfnDefinition(selectedMachineArn);
  const definition = definitionData?.definition;
  const logGroupName = definitionData?.logGroupName;

  const { data: executions = [] } = useSfnExecutions(
    selectedMachineArn,
    selectedMachine?.machineType,
    logGroupName
  );

  const { data: steps = [], isLoading: loadingHistory, error: errorHistory } = useSfnHistory(
    selectedExecutionArn,
    selectedMachine?.machineType,
    logGroupName
  );

  const startExecutionMutation = useStartSfnExecution();

  const { goToLogs, goToInvokeSfn } = useCwStore();
  const { setActiveView } = useWorkspace();
  const monacoTheme = useMonacoTheme();

  const [editMode, setEditMode] = useState(false);
  const [editedInput, setEditedInput] = useState('');
  const [activeTab, setActiveTab] = useState<'execution' | 'definition'>('execution');
  const [showIoModal, setShowIoModal] = useState(false);
  const [copiedIo, setCopiedIo] = useState<'request' | 'response' | null>(null);
  const [monacoEditor, setMonacoEditor] = useState<any>(null);
  const [selectedStateName, setSelectedStateName] = useState<string | null>(null);
  const decorationIds = React.useRef<string[]>([]);

  const isExpress = selectedMachine?.machineType.includes('EXPRESS');

  // Prettify definition for Monaco
  const formattedDefinition = React.useMemo(() => {
    if (!definition) return '';
    try {
      const parsed = JSON.parse(definition);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return definition;
    }
  }, [definition]);

  // Extract states for the navigator sidebar
  const stateNames = React.useMemo(() => {
    if (!definition) return [];
    try {
      const parsed = JSON.parse(definition);
      return Object.keys(parsed.States || {});
    } catch {
      return [];
    }
  }, [definition]);

  const scrollToState = (stateName: string) => {
    setSelectedStateName(stateName);
    if (!monacoEditor) return;
    const model = monacoEditor.getModel();
    if (!model) return;

    const matches = model.findMatches(`"${stateName}":`, true, false, true, null, true);
    if (matches.length > 0) {
      const startLine = matches[0].range.startLineNumber;

      // Calculate the end line of the state block by counting braces
      let endLine = startLine;
      let braceCount = 0;
      let started = false;
      const totalLines = model.getLineCount();

      for (let i = startLine; i <= totalLines; i++) {
        const lineText = model.getLineContent(i);
        for (const char of lineText) {
          if (char === '{') {
            braceCount++;
            started = true;
          } else if (char === '}') {
            braceCount--;
          }
        }
        if (started && braceCount === 0) {
          endLine = i;
          break;
        }
      }

      // Reveal the entire block
      monacoEditor.revealRangeInCenter({
        startLineNumber: startLine,
        startColumn: 1,
        endLineNumber: endLine,
        endColumn: 1
      }, 0); // 0 = Smooth scroll

      monacoEditor.setPosition({ lineNumber: startLine, column: 1 });
      monacoEditor.focus();

      // Highlight only the boundaries (start and end) of the block
      decorationIds.current = monacoEditor.deltaDecorations(decorationIds.current, [
        {
          // First line: highlight with a top border
          range: new (window as any).monaco.Range(startLine, 1, startLine, 1),
          options: {
            isWholeLine: true,
            className: 'bg-microtermix-neon/15 border-t border-microtermix-neon/40',
            glyphMarginClassName: 'bg-microtermix-neon',
          }
        },
        {
          // Last line: highlight with a bottom border
          range: new (window as any).monaco.Range(endLine, 1, endLine, 1),
          options: {
            isWholeLine: true,
            className: 'bg-microtermix-neon/15 border-b border-microtermix-neon/40',
          }
        },
        {
          // Connecting line in the margin
          range: new (window as any).monaco.Range(startLine, 1, endLine, 1),
          options: {
            isWholeLine: true,
            linesDecorationsClassName: 'border-l-2 border-microtermix-neon/30 ml-1',
          }
        }
      ]);
    }
  };

  // Clear decorations when changing machine or tab
  useEffect(() => {
    if (monacoEditor) {
      decorationIds.current = monacoEditor.deltaDecorations(decorationIds.current, []);
      setSelectedStateName(null);
    }
  }, [selectedMachineArn, activeTab]);

  // Auto-fill input from the first step when selected
  useEffect(() => {
    if (steps.length > 0 && steps[0].input) {
      const rawInput = steps[0].input;
      try {
        // Smart parse to handle potential multi-escaped JSON strings
        const smartParse = (val: string): any => {
          const trimmed = val.trim();
          if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            const parsed = JSON.parse(val);
            if (typeof parsed === 'string') return smartParse(parsed);
            return parsed;
          }
          return val;
        };

        const parsed = smartParse(rawInput);
        const formatted = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
        setEditedInput(formatted);
      } catch (e) {
        setEditedInput(rawInput);
      }
    }
  }, [steps]);

  const handleRestart = async () => {
    if (!selectedMachineArn) return;
    try {
      // Validate JSON
      JSON.parse(editedInput);
      await startExecutionMutation.mutateAsync({
        machineArn: selectedMachineArn,
        input: editedInput
      });
      setEditMode(false);
      setActiveTab('execution');
    } catch (e) {
      alert('Invalid JSON input');
    }
  };

  const handleGoToLogs = () => {
    if (!selectedMachine) return;
    const actualLogGroup = logGroupName || `/aws/vendedlogs/states/${selectedMachine.name}-Logs`;
    goToLogs(actualLogGroup);
    setActiveView('cloudwatch');
  };

  const selectedExecution = executions.find(e => e.executionArn === selectedExecutionArn);

  const executionRequest  = steps.length > 0 ? steps[0].input : undefined;
  const executionResponse = steps.length > 0 ? steps[steps.length - 1].output : undefined;

  const prettyJson = (raw?: string): string => {
    if (!raw) return '';
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  };

  const handleCopyIo = (which: 'request' | 'response') => {
    const text = which === 'request' ? prettyJson(executionRequest) : prettyJson(executionResponse);
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedIo(which);
    setTimeout(() => setCopiedIo(null), 2000);
  };

  if (!selectedMachineArn) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-slate-500 bg-slate-950">
        <div className="w-16 h-16 rounded-full border border-slate-800 flex items-center justify-center mb-6">
          <ChevronRight size={32} className="opacity-20" />
        </div>
        <p className="text-sm font-medium">No state machine selected</p>
        <p className="text-xs text-slate-600 mt-2 italic text-center max-w-[200px]">
          Select a state machine from the list to inspect its definition and executions.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between shrink-0">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white truncate max-w-[300px]" title={selectedMachine?.name}>
              {selectedMachine?.name}
            </h2>
            <Badge
              variant="outline"
              className={`text-[9px] h-4.5 px-1.5 tabular-nums border-slate-800 ${isExpress ? 'text-blue-400 border-blue-900/50 bg-blue-500/5' : 'text-emerald-400 border-emerald-900/50 bg-emerald-500/5'
                }`}
            >
              {isExpress ? 'EXPRESS' : 'STANDARD'}
            </Badge>
          </div>
          <p className="text-[10px] text-slate-500 truncate font-mono">{selectedMachineArn}</p>
        </div>

        <div className="flex items-center gap-2">
          {selectedMachine && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs text-amber-300 border-amber-500/30 hover:bg-amber-500/10"
                onClick={() => goToInvokeSfn(selectedMachine.name)}
                title="Test en Invoke Tester"
              >
                <Zap className="h-3 w-3 mr-1.5" />
                Test
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs text-slate-300 border-slate-700"
                onClick={handleGoToLogs}
                title="Ver logs en CloudWatch"
              >
                <ScrollText className="h-3 w-3 mr-1.5" />
                Logs
              </Button>
            </>
          )}
          <Button
            variant={editMode ? 'default' : 'outline'}
            size="sm"
            className={`h-8 text-xs ${editMode ? 'bg-microtermix-neon text-slate-950' : 'text-slate-300 border-slate-700'}`}
            onClick={() => setEditMode(!editMode)}
          >
            <RotateCcw className="h-3 w-3 mr-1.5" />
            New Execution
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col min-h-0">
        <div className="px-4 border-b border-slate-800 bg-slate-900/20 flex items-center justify-between shrink-0">
          <TabsList className="h-10 bg-transparent p-0 gap-4">
            <TabsTrigger
              value="execution"
              className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-microtermix-neon data-[state=active]:bg-transparent data-[state=active]:text-white text-slate-500 text-xs px-1"
            >
              <HistoryIcon size={14} className="mr-2" />
              Executions & Steps
            </TabsTrigger>
            <TabsTrigger
              value="definition"
              className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-microtermix-neon data-[state=active]:bg-transparent data-[state=active]:text-white text-slate-500 text-xs px-1"
            >
              <FileCode size={14} className="mr-2" />
              Definition (ASL)
            </TabsTrigger>
          </TabsList>

          {activeTab === 'execution' && selectedExecution && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">{selectedExecution.name}</span>
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 tabular-nums text-slate-400 border-slate-800">
                {steps.length} steps
              </Badge>
              {steps.length > 0 && (
                <Button
                  variant="outline"
                  size="xs"
                  className="h-5 px-2 text-[9px] border-slate-700 text-slate-400 hover:text-white gap-1"
                  onClick={() => setShowIoModal(true)}
                >
                  <ArrowUpDown size={9} />
                  I/O
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 flex min-h-0 overflow-hidden">
          <TabsContent value="execution" className="flex-1 m-0 flex flex-row min-h-0 overflow-hidden">
            {/* Step Timeline */}
            <div className="flex-1 flex flex-col min-h-0">
              {!selectedExecutionArn ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500">
                  <div className="w-12 h-12 rounded-full border border-slate-800/50 flex items-center justify-center mb-4">
                    <HistoryIcon size={24} className="opacity-20" />
                  </div>
                  <p className="text-xs font-medium italic">Select an execution to view steps</p>
                  {isExpress && !logGroupName && (
                    <div className="mt-8 max-w-sm p-4 bg-blue-950/20 border border-blue-900/50 rounded-lg flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-blue-400 font-semibold text-xs">
                        <Info size={14} />
                        EXPRESS WORKFLOW LOGS
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        This is an Express workflow. To see step-by-step history, ensure logging is enabled
                        and the log group is configured in the state machine settings.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-[11px] border-blue-900/50 text-blue-300 hover:bg-blue-900/30"
                        onClick={handleGoToLogs}
                      >
                        <ExternalLink size={12} className="mr-1.5" />
                        Check CloudWatch Logs
                      </Button>
                    </div>
                  )}
                </div>
              ) : loadingHistory ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-microtermix-neon mb-4" />
                  <p className="text-xs text-slate-400">Loading execution history...</p>
                </div>
              ) : errorHistory ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
                  <AlertCircle size={32} className="text-rose-500" />
                  <p className="text-xs text-rose-400 text-center max-w-xs">{String(errorHistory)}</p>
                </div>
              ) : (
                <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
                  {steps.map((step, idx) => (
                    <SfnStepCard
                      key={`${step.name}-${idx}`}
                      step={step}
                      isFirst={idx === 0}
                      isLast={idx === steps.length - 1}
                      prevOutput={steps[idx - 1]?.output}
                    />
                  ))}
                  {steps.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-12 text-slate-500 bg-slate-900/10 rounded-lg border border-dashed border-slate-800">
                      <HistoryIcon size={24} className="mb-2 opacity-20" />
                      <p className="text-xs italic">No steps found for this execution</p>
                      {isExpress && (
                        <p className="text-[10px] text-slate-600 mt-2 text-center max-w-[250px]">
                          Ensure CloudWatch logging is enabled for this Express workflow.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Execution I/O Modal */}
            <Dialog open={showIoModal} onOpenChange={setShowIoModal}>
              <DialogContent className="sm:max-w-5xl w-[92vw] h-[80vh] flex flex-col gap-0 p-0 overflow-hidden bg-slate-950 border-slate-800">
                <DialogHeader className="p-4 border-b border-slate-800 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700">
                      <ArrowUpDown size={16} className="text-microtermix-neon" />
                    </div>
                    <div>
                      <DialogTitle className="text-slate-100 text-sm">Execution I/O</DialogTitle>
                      <DialogDescription className="text-slate-500 text-[11px] mt-0.5 font-mono truncate max-w-[400px]">
                        {selectedExecution?.name}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="flex-1 min-h-0 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-800">
                  {/* Request */}
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/40">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Request (Input)</span>
                      <button
                        onClick={() => handleCopyIo('request')}
                        className="p-1 hover:bg-slate-800 rounded transition-all text-slate-500 hover:text-microtermix-neon"
                        title="Copy request"
                      >
                        {copiedIo === 'request' ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                    <pre className="flex-1 overflow-auto p-4 font-mono text-[11px] text-slate-300 whitespace-pre-wrap break-all scrollbar-thin scrollbar-thumb-slate-800">
                      {prettyJson(executionRequest) || <span className="text-slate-600 italic">No input available</span>}
                    </pre>
                  </div>

                  {/* Response */}
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/40">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Response (Output)</span>
                      <button
                        onClick={() => handleCopyIo('response')}
                        className="p-1 hover:bg-slate-800 rounded transition-all text-slate-500 hover:text-microtermix-neon"
                        title="Copy response"
                      >
                        {copiedIo === 'response' ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                    <pre className="flex-1 overflow-auto p-4 font-mono text-[11px] text-emerald-300/80 whitespace-pre-wrap break-all scrollbar-thin scrollbar-thumb-slate-800">
                      {prettyJson(executionResponse) || <span className="text-slate-600 italic">No output available</span>}
                    </pre>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* New Execution Dialog */}
            <Dialog open={editMode} onOpenChange={setEditMode}>
              <DialogContent className="sm:max-w-4xl w-[90vw] h-[85vh] flex flex-col gap-0 p-0 overflow-hidden bg-slate-950 border-slate-800">
                <DialogHeader className="p-4 border-b border-slate-800 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-microtermix-neon/10 flex items-center justify-center border border-microtermix-neon/20">
                      <Play size={16} className="text-microtermix-neon fill-current" />
                    </div>
                    <div>
                      <DialogTitle className="text-slate-100 text-sm">Start New Execution</DialogTitle>
                      <DialogDescription className="text-slate-500 text-[11px] mt-0.5">
                        Launch a new instance of <span className="text-slate-300 font-mono">{selectedMachine?.name}</span>
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="bg-slate-900/50 px-4 py-2 border-b border-slate-800 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      <Code size={12} className="text-microtermix-neon" />
                      Input (JSON)
                    </div>
                    <Badge variant="outline" className="text-[9px] h-4.5 px-1.5 text-slate-500 border-slate-800">
                      {isExpress ? 'EXPRESS' : 'STANDARD'}
                    </Badge>
                  </div>

                  <div className="flex-1 min-h-0 relative">
                    <Editor
                      height="100%"
                      language="json"
                      theme={monacoTheme}
                      value={editedInput}
                      onChange={(v) => setEditedInput(v || '')}
                      options={{
                        fontSize: 13,
                        minimap: { enabled: false },
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        padding: { top: 16 },
                        wordWrap: 'on',
                        bracketPairColorization: { enabled: true },
                        formatOnPaste: true,
                        formatOnType: true,
                      }}
                    />
                  </div>
                </div>

                <DialogFooter className="p-4 bg-slate-900/40 border-t border-slate-800 shrink-0 gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => setEditMode(false)}
                    className="text-slate-400 hover:text-white text-xs h-9 px-4"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleRestart}
                    disabled={startExecutionMutation.isPending}
                    className="bg-microtermix-neon text-slate-950 hover:bg-microtermix-neon/90 font-bold text-xs h-9 px-6"
                  >
                    {startExecutionMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play size={14} className="mr-2 fill-current" />
                    )}
                    Start Execution
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="definition" className="flex-1 m-0 flex flex-col min-h-0 relative">
            {loadingDefinition ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-microtermix-neon mb-4" />
                <p className="text-xs text-slate-400">Loading definition...</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-row min-h-0 relative">
                {/* States Navigator Sidebar */}
                <div className="w-48 shrink-0 border-r border-slate-800 bg-slate-900/20 overflow-auto flex flex-col">
                  <div className="p-3 border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <ListTree size={12} className="text-microtermix-neon" />
                    States
                  </div>
                    <div className="flex-1 py-1">
                      {stateNames.map(name => {
                        const isSelected = selectedStateName === name;
                        
                        // Detect Lambdas and Nested Step Functions
                        let lambdaName: string | null = null;
                        let sfnArn: string | null = null;
                        try {
                          const parsed = JSON.parse(definition || '{}');
                          const state = parsed.States?.[name];
                          if (state?.Type === 'Task') {
                            lambdaName = extractLambdaName(state.Resource, state.Parameters);
                            sfnArn = extractSfnArn(state.Resource, state.Parameters);
                          }
                        } catch {}

                        return (
                          <div key={name} className="group flex flex-col">
                            <div className={cn(
                              "flex items-center justify-between transition-all border-l-2 pr-2",
                              isSelected 
                                ? 'bg-slate-800 text-white border-white font-medium' 
                                : lambdaName 
                                  ? 'border-microtermix-neon/40 hover:bg-microtermix-neon/5 bg-microtermix-neon/2 text-slate-300'
                                  : sfnArn
                                    ? 'border-amber-500/40 hover:bg-amber-500/5 bg-amber-500/2 text-slate-300'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent'
                            )}>
                              <button
                                onClick={() => scrollToState(name)}
                                className="flex-1 text-left px-3 py-1.5 text-[11px] truncate"
                                title={name}
                              >
                                {name}
                              </button>
                              
                              <div className="flex items-center gap-1 shrink-0">
                                {lambdaName && (
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      goToLogs(`/aws/lambda/${lambdaName}`);
                                      setActiveView('cloudwatch');
                                    }}
                                    className="flex items-center gap-1 px-1.5 py-0.5 bg-microtermix-neon/10 border border-microtermix-neon/30 rounded-full text-[8px] font-black text-microtermix-neon hover:bg-microtermix-neon hover:text-slate-950 transition-all shrink-0"
                                    title="Ver Logs de Lambda"
                                  >
                                    <Terminal size={9} />
                                    LOGS
                                  </button>
                                )}

                                {sfnArn && (
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedMachineArn(sfnArn!);
                                    }}
                                    className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded-full text-[8px] font-black text-amber-500 hover:bg-amber-500 hover:text-slate-950 transition-all shrink-0"
                                    title="Ir a Step Function Anidada"
                                  >
                                    <GitBranch size={9} />
                                    SUB-SFN
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    {stateNames.length === 0 && (
                      <p className="p-3 text-[10px] text-slate-600 italic text-center">No states found</p>
                    )}
                  </div>
                </div>
                

                <div className="flex-1 relative min-w-0">
                  <Editor
                    height="100%"
                    language="json"
                    theme={monacoTheme}
                    value={formattedDefinition}
                    onMount={(editor) => setMonacoEditor(editor)}
                    options={{
                      readOnly: true,
                      fontSize: 13,
                      minimap: { enabled: true },
                      lineNumbers: 'on',
                      folding: true,
                      foldingHighlight: true,
                      showFoldingControls: 'always',
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      wordWrap: 'on',
                      padding: { top: 16, bottom: 16 },
                      bracketPairColorization: { enabled: true }
                    }}
                  />
                </div>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};
