import React, { useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw, AlertCircle, Search, Terminal, CheckCircle2, XCircle, Copy, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTempoStore, formatDuration } from '../../stores/tempoStore';
import { deleteWorklog, resolveMyAccountId, tempoApiLog, type TempoApiLogEntry } from '../../services/tempoApi';
import type { TempoWorklog } from '../../services/tempoApi';
import type { JiraConfig } from '../jiraApi';
import { PeriodSelector } from './PeriodSelector';
import { WorklogList } from './WorklogList';
import { CalendarView } from './CalendarView';
import { LogTimeModal } from './LogTimeModal';

interface TempoTabProps {
  config: JiraConfig;
  accountId: string; // defaultAssigneeId — may be empty, resolved automatically
}

type SubTab = 'my-worklogs' | 'calendar' | 'by-issue';

// ── Console (bottom panel) ─────────────────────────────────────────────────────

const TempoConsole: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [entries, setEntries] = useState<TempoApiLogEntry[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (entry: TempoApiLogEntry) => {
      setEntries(prev => [...prev.slice(-199), entry]);
    };
    tempoApiLog.on(handler);
    return () => tempoApiLog.off(handler);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copiado'));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700 bg-slate-900 shrink-0">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
          <Terminal size={11} />
          <span>Console</span>
          {entries.length > 0 && (
            <span className="text-slate-600">({entries.length})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {entries.length > 0 && (
            <button
              onClick={() => setEntries([])}
              className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-300 transition-colors"
            >
              <Trash2 size={10} /> Limpiar
            </button>
          )}
          <button
            onClick={onClose}
            className="text-slate-600 hover:text-slate-300 transition-colors"
            title="Cerrar consola"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto font-mono text-[11px] bg-slate-950 scrollbar-hide">
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-full gap-2 text-slate-700">
            <Terminal size={14} />
            <span>Sin actividad. Realiza una acción para ver los logs.</span>
          </div>
        ) : (
          <>
            {entries.map(e => (
              <div key={e.id} className="border-b border-slate-800/60">
                {/* Summary row */}
                <div
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-800/40 transition-colors',
                    !e.ok && 'bg-red-950/20',
                  )}
                  onClick={() => setExpanded(prev => prev === e.id ? null : e.id)}
                >
                  {e.ok
                    ? <CheckCircle2 size={10} className="text-green-500 shrink-0" />
                    : <XCircle size={10} className="text-red-400 shrink-0" />
                  }
                  <span className="text-slate-600 shrink-0">{e.time}</span>
                  <span className={cn('font-bold shrink-0 w-9', e.ok ? 'text-nexus-neon' : 'text-red-400')}>
                    {e.method}
                  </span>
                  <span className="text-slate-300 truncate flex-1">{e.path}</span>
                  {e.status && (
                    <span className={cn('shrink-0 px-1.5 py-0.5 rounded text-[10px]', e.ok ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400')}>
                      {e.status}
                    </span>
                  )}
                  {e.durationMs !== undefined && (
                    <span className="text-slate-700 shrink-0">{e.durationMs}ms</span>
                  )}
                </div>

                {/* Expanded detail */}
                {expanded === e.id && (
                  <div className="bg-slate-950 px-3 py-2 space-y-2 border-t border-slate-800">
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wide">URL</span>
                        <button onClick={() => copyText(e.url)} className="text-[10px] text-slate-600 hover:text-slate-300 flex items-center gap-1">
                          <Copy size={9} /> copiar
                        </button>
                      </div>
                      <p className="text-slate-300 break-all">{e.url}</p>
                    </div>

                    {e.body && (
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wide">Body</span>
                        <pre className="text-slate-300 mt-0.5 whitespace-pre-wrap break-all bg-slate-900 rounded p-2">
                          {(() => { try { return JSON.stringify(JSON.parse(e.body), null, 2); } catch { return e.body; } })()}
                        </pre>
                      </div>
                    )}

                    {e.responsePreview && (
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wide">Response</span>
                        <pre className={cn('mt-0.5 whitespace-pre-wrap break-all bg-slate-900 rounded p-2', e.ok ? 'text-slate-300' : 'text-red-300')}>
                          {(() => { try { return JSON.stringify(JSON.parse(e.responsePreview), null, 2).slice(0, 600); } catch { return e.responsePreview; } })()}
                        </pre>
                      </div>
                    )}

                    {e.error && !e.responsePreview && (
                      <div>
                        <span className="text-[10px] text-red-500 uppercase tracking-wide">Error</span>
                        <p className="text-red-300 mt-0.5 break-all">{e.error}</p>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wide">cURL</span>
                        <button onClick={() => copyText(e.curl)} className="text-[10px] text-slate-600 hover:text-slate-300 flex items-center gap-1">
                          <Copy size={9} /> copiar
                        </button>
                      </div>
                      <pre className="text-slate-400 whitespace-pre-wrap break-all bg-slate-900 rounded p-2">{e.curl}</pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  );
};

// ── Main TempoTab ──────────────────────────────────────────────────────────────

export const TempoTab: React.FC<TempoTabProps> = ({ config, accountId: propAccountId }) => {
  const {
    worklogs, issueWorklogs, period, loading, loadingIssue, error,
    setPeriod, fetchWorklogs, fetchIssueWorklogs, removeWorklog, upsertWorklog,
  } = useTempoStore();

  const [subTab, setSubTab] = useState<SubTab>('my-worklogs');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWorklog, setEditingWorklog] = useState<TempoWorklog | undefined>();
  const [defaultIssueKey, setDefaultIssueKey] = useState('');
  const [issueSearchInput, setIssueSearchInput] = useState('');
  const [activeIssueId, setActiveIssueId] = useState<number | null>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [resolvedAccountId, setResolvedAccountId] = useState<string | null>(propAccountId || null);

  const token = config.tempoToken;
  const hasToken = !!token;

  // Auto-open console when a new log entry arrives and console is closed
  useEffect(() => {
    const handler = () => { /* just subscribe — user opens manually */ };
    tempoApiLog.on(handler);
    return () => tempoApiLog.off(handler);
  }, []);

  // Resolve accountId on mount if not provided
  useEffect(() => {
    if (propAccountId) { setResolvedAccountId(propAccountId); return; }
    if (!config.email || !config.apiToken || !config.baseUrl) return;
    resolveMyAccountId(config.baseUrl, config.email, config.apiToken).then(id => {
      if (id) setResolvedAccountId(id);
    });
  }, [propAccountId, config.baseUrl, config.email, config.apiToken]);

  // Fetch worklogs when period, account, or resolved id changes
  useEffect(() => {
    if (!hasToken || !resolvedAccountId) return;
    fetchWorklogs(token, resolvedAccountId, config.baseUrl, config.email, config.apiToken);
  }, [period, resolvedAccountId, token]);

  const handleRefresh = () => {
    if (!hasToken || !resolvedAccountId) return;
    fetchWorklogs(token, resolvedAccountId, config.baseUrl, config.email, config.apiToken);
  };

  const handleEdit = (worklog: TempoWorklog) => {
    setEditingWorklog(worklog);
    setDefaultIssueKey('');
    setModalOpen(true);
  };

  const handleLogTime = (issueKey?: string) => {
    setEditingWorklog(undefined);
    setDefaultIssueKey(issueKey ?? '');
    setModalOpen(true);
  };

  const handleDelete = async (tempoWorklogId: number) => {
    if (!confirm('¿Eliminar este worklog?')) return;
    try {
      await deleteWorklog(token, tempoWorklogId);
      removeWorklog(tempoWorklogId);
      toast.success('Worklog eliminado');
    } catch (e: any) {
      toast.error('Error al eliminar', { description: e.message });
    }
  };

  const handleIssueSearch = () => {
    const key = issueSearchInput.trim().toUpperCase();
    if (!key || !hasToken) return;
    fetch(`${config.baseUrl}/rest/api/3/issue/${key}?fields=id,summary`, {
      headers: { Authorization: `Basic ${btoa(`${config.email}:${config.apiToken}`)}`, Accept: 'application/json' },
    } as RequestInit)
      .then(r => r.json())
      .then(data => {
        const id = parseInt(data.id, 10);
        if (!isNaN(id)) {
          setActiveIssueId(id);
          fetchIssueWorklogs(token, id, config.baseUrl, config.email, config.apiToken, resolvedAccountId ?? undefined);
        } else {
          toast.error('Issue no encontrado');
        }
      })
      .catch(() => toast.error('Error buscando issue'));
  };

  if (!hasToken) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 p-8 text-center">
        <AlertCircle size={24} />
        <p className="text-sm">Tempo token no configurado.</p>
        <p className="text-xs text-slate-600">Ve a <span className="text-nexus-neon">Configuración</span> y completa el campo "Tempo Token".</p>
      </div>
    );
  }

  const totalPeriod = worklogs.reduce((s, w) => s + w.timeSpentSeconds, 0);

  const SUB_TABS: { id: SubTab; label: string }[] = [
    { id: 'my-worklogs', label: 'Worklogs' },
    { id: 'calendar', label: 'Calendario' },
    { id: 'by-issue', label: 'Por Issue' },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sub-tab bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-800 shrink-0">
        <div className="flex rounded-md bg-slate-800/60 p-0.5 text-[11px] font-medium">
          {SUB_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={cn(
                'px-3 py-1 rounded transition-colors',
                subTab === t.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {totalPeriod > 0 && subTab === 'my-worklogs' && (
            <span className="border border-nexus-neon/30 text-nexus-neon font-mono text-[11px] px-2 py-0.5 rounded">
              {formatDuration(totalPeriod)} total
            </span>
          )}
          {resolvedAccountId && (
            <span className="text-[10px] text-slate-600 font-mono hidden sm:block" title="Jira Account ID">
              {resolvedAccountId.slice(0, 8)}…
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => handleLogTime()}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold bg-nexus-neon text-slate-900 hover:bg-opacity-80 transition-colors"
          >
            <Plus size={12} /> Registrar
          </button>
        </div>
      </div>

      {/* Main content — flex-1 so console stays at bottom */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* My Worklogs */}
        {subTab === 'my-worklogs' && (
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 scrollbar-hide">
            <div className="mb-3">
              <PeriodSelector period={period} onChange={setPeriod} />
            </div>
            {!resolvedAccountId && (
              <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-900/20 border border-amber-800/40 rounded-lg px-3 py-2 mb-3">
                <AlertCircle size={13} /> Resolviendo tu Account ID de Jira…
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2 mb-3">
                <AlertCircle size={13} />
                <span className="flex-1">{error}</span>
                <button onClick={() => setConsoleOpen(true)} className="underline text-red-300 hover:text-white shrink-0">
                  ver log
                </button>
              </div>
            )}
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-500 text-sm gap-2">
                <RefreshCw size={14} className="animate-spin" /> Cargando…
              </div>
            ) : (
              <WorklogList worklogs={worklogs} onEdit={handleEdit} onDelete={handleDelete} />
            )}
          </div>
        )}

        {/* Calendar */}
        {subTab === 'calendar' && (
          <div className="flex-1 min-h-0 overflow-hidden px-2 py-2">
            <div className="mb-2 px-2">
              <PeriodSelector period={period} onChange={setPeriod} />
            </div>
            <div className="h-[calc(100%-36px)]">
              <CalendarView worklogs={worklogs} period={period} onEdit={handleEdit} />
            </div>
          </div>
        )}

        {/* By Issue */}
        {subTab === 'by-issue' && (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 shrink-0">
              <div className="flex gap-2">
                <input
                  value={issueSearchInput}
                  onChange={e => setIssueSearchInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleIssueSearch()}
                  placeholder="PROJ-123"
                  className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-white font-mono text-sm focus:outline-none focus:border-nexus-neon"
                />
                <button
                  onClick={handleIssueSearch}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs transition-colors"
                >
                  <Search size={13} /> Buscar
                </button>
                {activeIssueId && (
                  <button
                    onClick={() => handleLogTime(issueSearchInput.trim().toUpperCase())}
                    className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold bg-nexus-neon text-slate-900 hover:bg-opacity-80 transition-colors"
                  >
                    <Plus size={12} /> Log
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-hide">
              {loadingIssue ? (
                <div className="flex items-center justify-center py-16 text-slate-500 text-sm gap-2">
                  <RefreshCw size={14} className="animate-spin" /> Cargando…
                </div>
              ) : (
                <WorklogList worklogs={issueWorklogs} onEdit={handleEdit} onDelete={handleDelete} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Console — collapsible bottom panel */}
      <div className={cn(
        'shrink-0 border-t border-slate-700 transition-all duration-200',
        consoleOpen ? 'h-56' : 'h-7',
      )}>
        {consoleOpen ? (
          <TempoConsole onClose={() => setConsoleOpen(false)} />
        ) : (
          <button
            onClick={() => setConsoleOpen(true)}
            className="w-full h-full flex items-center gap-2 px-3 text-[11px] text-slate-600 hover:text-slate-400 hover:bg-slate-800/30 transition-colors font-mono"
          >
            <Terminal size={11} />
            <span>Console</span>
            <ChevronUp size={11} className="ml-auto" />
          </button>
        )}
      </div>

      <LogTimeModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        tempoToken={token}
        authorAccountId={resolvedAccountId ?? ''}
        defaultIssueKey={defaultIssueKey}
        editingWorklog={editingWorklog}
        onSuccess={upsertWorklog}
      />
    </div>
  );
};
