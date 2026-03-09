import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { type TempoWorklog, updateWorklog } from '../../services/tempoApi';
import { parseTimeInput, formatDuration } from '../../stores/tempoStore';

interface LogTimeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tempoToken: string;
  authorAccountId: string;
  defaultIssueKey?: string;
  editingWorklog?: TempoWorklog;
  onSuccess: (worklog: TempoWorklog) => void;
}

export const LogTimeModal: React.FC<LogTimeModalProps> = ({
  open, onOpenChange, tempoToken, authorAccountId, defaultIssueKey, editingWorklog, onSuccess,
}) => {
  const isEditing = !!editingWorklog;
  const [issueInput, setIssueInput] = useState('');
  const [timeInput, setTimeInput] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState<Date>(new Date());
  const [calOpen, setCalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [timeError, setTimeError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editingWorklog) {
      setIssueInput(editingWorklog.issueKey ?? String(editingWorklog.issue.id));
      setTimeInput(formatDuration(editingWorklog.timeSpentSeconds));
      setDescription(editingWorklog.description ?? '');
      setDate(new Date(editingWorklog.startDate + 'T12:00:00'));
    } else {
      setIssueInput(defaultIssueKey ?? '');
      setTimeInput('');
      setDescription('');
      setDate(new Date());
    }
    setTimeError('');
  }, [open, editingWorklog, defaultIssueKey]);

  const handleSave = async () => {
    const seconds = parseTimeInput(timeInput);
    if (!seconds) { setTimeError('Formato inválido. Usa: 1h 30m, 1.5h, 90m'); return; }
    if (!issueInput.trim()) return;
    setSaving(true);
    try {
      const startDate = date.toISOString().split('T')[0];
      let result: TempoWorklog;
      if (isEditing && editingWorklog) {
        result = await updateWorklog(tempoToken, editingWorklog.tempoWorklogId, {
          timeSpentSeconds: seconds,
          startDate,
          description: description.trim() || undefined,
        });
        result = { ...result, issueKey: editingWorklog.issueKey, issueSummary: editingWorklog.issueSummary, issue: editingWorklog.issue };
      } else {
        const createPayload = {
          issue: { key: issueInput.trim().toUpperCase() },
          authorAccountId,
          timeSpentSeconds: seconds,
          startDate,
          description: description.trim() || undefined,
        };
        const res = await fetch('https://api.tempo.io/4/worklogs', {
          method: 'POST',
          headers: { Authorization: `Bearer ${tempoToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(createPayload),
        });
        const t = await res.text();
        if (!res.ok) throw new Error(`Tempo ${res.status}: ${t}`);
        result = JSON.parse(t);
        result.issueKey = issueInput.trim().toUpperCase();
      }
      onSuccess(result);
      toast.success(isEditing ? 'Worklog actualizado' : 'Tiempo registrado', {
        description: `${formatDuration(seconds)} en ${issueInput.trim().toUpperCase()}`,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Error al guardar', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const parsedSeconds = parseTimeInput(timeInput);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white w-[420px] max-w-[95vw]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-white">
            {isEditing ? 'Editar tiempo' : 'Registrar tiempo'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Issue key</Label>
            <Input
              value={issueInput}
              onChange={e => setIssueInput(e.target.value)}
              placeholder="PROJ-123"
              disabled={isEditing}
              className="bg-slate-800 border-slate-700 text-white font-mono text-sm focus:border-nexus-neon disabled:opacity-60"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Fecha</Label>
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md border bg-slate-800 border-slate-700 text-white text-sm hover:bg-slate-700 transition-colors text-left',
                )}
              >
                <CalendarIcon size={14} className="text-slate-400" />
                {date ? format(date, 'dd/MM/yyyy') : 'Seleccionar fecha'}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-slate-900 border-slate-700" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d: Date | undefined) => { if (d) { setDate(d); setCalOpen(false); } }}
                  className="text-white"
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">
              Tiempo
              {parsedSeconds ? <span className="text-nexus-neon ml-2">→ {formatDuration(parsedSeconds)}</span> : null}
            </Label>
            <Input
              value={timeInput}
              onChange={e => { setTimeInput(e.target.value); setTimeError(''); }}
              placeholder="1h 30m · 1.5h · 90m"
              className={cn('bg-slate-800 border-slate-700 text-white font-mono text-sm focus:border-nexus-neon', timeError && 'border-red-500')}
            />
            {timeError && <p className="text-xs text-red-400">{timeError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Descripción <span className="text-slate-600">(opcional)</span></Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="¿En qué trabajaste?"
              rows={3}
              className="bg-slate-800 border-slate-700 text-white text-sm resize-none focus:border-nexus-neon"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !issueInput.trim() || !timeInput.trim()}
            className="px-4 py-1.5 rounded text-xs font-bold bg-nexus-neon text-slate-900 hover:bg-opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            {isEditing ? 'Guardar cambios' : 'Registrar'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
