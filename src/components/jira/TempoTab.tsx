import React, { useEffect, useState } from 'react';
import { Plus, RefreshCw, AlertCircle, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTempoStore, formatDuration } from '../../stores/tempoStore';
import { resolveMyAccountId } from '../../services/tempoApi';
import type { TempoWorklog } from '../../services/tempoApi';
import type { JiraConfig } from './jiraApi';
import { PeriodSelector } from './PeriodSelector';
import { WorklogList } from './WorklogList';
import { CalendarView } from './CalendarView';
import { LogTimeModal } from './LogTimeModal';
import { useTempoWorklogs, useTempoIssueWorklogs, useTempoDeleteWorklog, tempoKeys } from '../../hooks/queries/useTempoQueries';
import { useQueryClient } from '@tanstack/react-query';

interface TempoTabProps {
  config: JiraConfig;
  accountId: string; // defaultAssigneeId — may be empty, resolved automatically
}

type SubTab = 'my-worklogs' | 'calendar' | 'by-issue';


// ── Main TempoTab ──────────────────────────────────────────────────────────────

export const TempoTab: React.FC<TempoTabProps> = ({ config, accountId: propAccountId }) => {
  const {
    period, setPeriod
  } = useTempoStore();

  const queryClient = useQueryClient();
  const [resolvedAccountId, setResolvedAccountId] = useState<string | null>(propAccountId || null);

  const { 
    data: worklogs = [], 
    isLoading: loading, 
    error: worklogsError 
  } = useTempoWorklogs(config, resolvedAccountId);

  const [activeIssueId, setActiveIssueId] = useState<number | null>(null);
  const {
    data: issueWorklogs = [],
    isLoading: loadingIssue
  } = useTempoIssueWorklogs(config, activeIssueId, resolvedAccountId);

  const deleteMutation = useTempoDeleteWorklog(config.tempoToken);

  const [subTab, setSubTab] = useState<SubTab>('my-worklogs');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWorklog, setEditingWorklog] = useState<TempoWorklog | undefined>();
  const [defaultIssueKey, setDefaultIssueKey] = useState('');
  const [issueSearchInput, setIssueSearchInput] = useState('');

  const token = config.tempoToken;
  const hasToken = !!token;

  // Resolve accountId on mount if not provided
  useEffect(() => {
    if (propAccountId) { setResolvedAccountId(propAccountId); return; }
    if (!config.email || !config.apiToken || !config.baseUrl) return;
    resolveMyAccountId(config.baseUrl, config.email, config.apiToken).then(id => {
      if (id) setResolvedAccountId(id);
    });
  }, [propAccountId, config.baseUrl, config.email, config.apiToken]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: tempoKeys.all });
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
    deleteMutation.mutate(tempoWorklogId);
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
        <p className="text-xs text-slate-600">Ve a <span className="text-microtermix-neon">Configuración</span> y completa el campo "Tempo Token".</p>
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
            <span className="border border-microtermix-neon/30 text-microtermix-neon font-mono text-[11px] px-2 py-0.5 rounded">
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
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold bg-microtermix-neon text-slate-900 hover:bg-opacity-80 transition-colors"
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
            {worklogsError && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2 mb-3">
                <AlertCircle size={13} />
                <span className="flex-1">{String(worklogsError)}</span>
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
                  className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-white font-mono text-sm focus:outline-none focus:border-microtermix-neon"
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
                    className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold bg-microtermix-neon text-slate-900 hover:bg-opacity-80 transition-colors"
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


      <LogTimeModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        tempoToken={token}
        authorAccountId={resolvedAccountId ?? ''}
        defaultIssueKey={defaultIssueKey}
        editingWorklog={editingWorklog}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: tempoKeys.all })}
      />
    </div>
  );
};
