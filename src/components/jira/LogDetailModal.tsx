import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, Terminal, CheckCircle2, XCircle, Clock, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import Editor from '@monaco-editor/react';

interface LogDetailModalProps {
  log: any | null;
  onClose: () => void;
}

export const LogDetailModal: React.FC<LogDetailModalProps> = ({ log, onClose }) => {
  if (!log) return null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado al portapapeles`);
  };

  const isJira = log.source === 'Jira';

  return (
    <Dialog open={!!log} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[98vw] sm:max-w-[98vw] max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden bg-slate-950 border-slate-800">
        <DialogHeader className="p-6 pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                isJira ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-magenta-500/10 text-magenta-400 border border-magenta-500/20'
              }`}>
                {log.source} API
              </span>
              {log.ok ? (
                <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">
                  <CheckCircle2 size={10} /> {log.status} OK
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                  <XCircle size={10} /> {log.status || 'Error'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-[11px] text-slate-500 font-mono">
              <span className="flex items-center gap-1"><Clock size={12} /> {log.time}</span>
              <span className="flex items-center gap-1"><ExternalLink size={12} /> {log.durationMs}ms</span>
            </div>
          </div>
          <DialogTitle className="text-lg font-mono text-slate-100 flex items-center gap-3 w-full overflow-hidden shrink-0">
            <span className="text-blue-400 font-bold shrink-0">{log.method}</span>
            <span className="text-slate-400 truncate opacity-90 text-[14px]" title={log.path}>
              {log.path}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
          {/* cURL Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Terminal size={12} /> RAW cURL (Postman Ready)
              </h3>
              <Button 
                variant="outline" 
                size="xs" 
                onClick={() => copyToClipboard(log.curl || '', 'cURL')}
                className="h-7 gap-1.5 border-slate-800 bg-slate-900 hover:bg-slate-800 text-microtermix-neon"
              >
                <Copy size={12} /> Copiar cURL
              </Button>
            </div>
            <div className="relative group">
              <pre className="p-4 bg-black rounded-lg border border-slate-800 text-[11px] font-mono text-slate-400 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-40 overflow-y-auto scrollbar-hide">
                {log.curl}
              </pre>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[400px]">
            {/* Request Body */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Request Body</h3>
                {(log.request || log.requestBody) && (
                  <Button variant="ghost" size="icon-xs" onClick={() => copyToClipboard(JSON.stringify(log.request || log.requestBody, null, 2), 'Request')}>
                    <Copy size={10} />
                  </Button>
                )}
              </div>
              <div className="flex-1 rounded-lg border border-slate-800 overflow-hidden bg-[#1e1e1e]">
                <Editor
                  height="100%"
                  defaultLanguage="json"
                  theme="vs-dark"
                  value={(log.request || log.requestBody) ? JSON.stringify((log.request || log.requestBody), null, 2) : '// No request body'}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 11,
                    scrollBeyondLastLine: false,
                    lineNumbers: 'on',
                    folding: true,
                    renderLineHighlight: 'none',
                    scrollbar: { vertical: 'hidden', horizontal: 'hidden' }
                  }}
                />
              </div>
            </div>

            {/* Response Body */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Response Body</h3>
                {(log.response || log.responseBody) && (
                  <Button variant="ghost" size="icon-xs" onClick={() => copyToClipboard(JSON.stringify(log.response || log.responseBody, null, 2), 'Response')}>
                    <Copy size={10} />
                  </Button>
                )}
              </div>
              <div className="flex-1 rounded-lg border border-slate-800 overflow-hidden bg-[#1e1e1e]">
                <Editor
                  height="100%"
                  defaultLanguage="json"
                  theme="vs-dark"
                  value={(log.response || log.responseBody) ? JSON.stringify((log.response || log.responseBody), null, 2) : '// No response body'}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 11,
                    scrollBeyondLastLine: false,
                    lineNumbers: 'on',
                    folding: true,
                    renderLineHighlight: 'none',
                    scrollbar: { vertical: 'hidden', horizontal: 'hidden' }
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end">
          <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
