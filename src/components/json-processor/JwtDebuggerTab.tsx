import React, { useState, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { ShieldCheck, AlertCircle, Copy, Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';

export const JwtDebuggerTab: React.FC = () => {
    const monacoTheme = useMonacoTheme();
    const [token, setToken] = useState('');

    const decoded = useMemo(() => {
        if (!token.trim()) return null;

        const parts = token.split('.');
        if (parts.length !== 3) {
            return { error: 'Formato de JWT inválido. Debe tener 3 partes separadas por puntos.' };
        }

        try {
            const decodePart = (part: string) => {
                try {
                    // Base64Url to Base64
                    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
                    const jsonPayload = decodeURIComponent(
                        atob(base64)
                            .split('')
                            .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                            .join('')
                    );
                    return JSON.parse(jsonPayload);
                } catch (e) {
                    return { raw: part, error: 'No se pudo parsear como JSON' };
                }
            };

            const header = decodePart(parts[0]);
            const payload = decodePart(parts[1]);
            const signature = parts[2];

            return { header, payload, signature, error: null };
        } catch (e: any) {
            return { error: `Error al decodificar: ${e.message}` };
        }
    }, [token]);

    const copyToClipboard = (val: any) => {
        const text = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
        navigator.clipboard.writeText(text);
        toast.success('Copiado al portapapeles');
    };

    return (
        <div className="flex flex-col h-full bg-slate-900">
            {/* Warning Header */}
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-950/20 border-b border-amber-900/30 text-[11px] text-amber-400">
                <ShieldCheck size={13} /> 
                <span>Decodificación puramente local (Client-side). Tus datos nunca salen de Microtermix.</span>
            </div>

            <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
                {/* Input Area */}
                <div className="w-full lg:w-1/3 border-r border-slate-800 flex flex-col bg-slate-950/50">
                    <div className="shrink-0 px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 flex items-center justify-between">
                        <span>Pegar JWT Token</span>
                        <Key size={12} className="text-violet-400" />
                    </div>
                    <div className="flex-1 p-3">
                        <textarea
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                            className="w-full h-full bg-slate-900 border border-slate-800 rounded-md p-3 font-mono text-xs text-slate-300 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 outline-none resize-none scrollbar-thin scrollbar-thumb-slate-800"
                        />
                    </div>
                </div>

                {/* Output Area */}
                <div className="flex-1 flex flex-col min-h-0">
                    {decoded?.error ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-rose-400 text-center gap-3">
                            <AlertCircle size={32} className="opacity-50" />
                            <p className="text-sm font-medium">{decoded.error}</p>
                        </div>
                    ) : decoded ? (
                        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
                            {/* Header Section */}
                            <div className="border-b border-slate-800">
                                <div className="px-4 py-2 bg-slate-900/50 flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">Header</span>
                                    <Button variant="ghost" size="icon-xs" onClick={() => copyToClipboard(decoded.header)}>
                                        <Copy size={12} />
                                    </Button>
                                </div>
                                <div className="h-32">
                                    <Editor
                                        height="100%"
                                        language="json"
                                        theme={monacoTheme}
                                        value={JSON.stringify(decoded.header, null, 2)}
                                        options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, lineNumbers: 'off', folding: false, scrollbar: { vertical: 'hidden' } }}
                                    />
                                </div>
                            </div>

                            {/* Payload Section */}
                            <div className="border-b border-slate-800">
                                <div className="px-4 py-2 bg-slate-900/50 flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">Payload (Claims)</span>
                                    <Button variant="ghost" size="icon-xs" onClick={() => copyToClipboard(decoded.payload)}>
                                        <Copy size={12} />
                                    </Button>
                                </div>
                                <div className="min-h-64">
                                    <Editor
                                        height="300px"
                                        language="json"
                                        theme={monacoTheme}
                                        value={JSON.stringify(decoded.payload, null, 2)}
                                        options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, lineNumbers: 'on', wordWrap: 'on' }}
                                    />
                                </div>
                            </div>

                            {/* Signature Section */}
                            <div className="p-4 bg-slate-950/30">
                                <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2">Signature</div>
                                <div className="p-3 bg-slate-900 border border-slate-800 rounded font-mono text-[10px] text-slate-500 break-all leading-relaxed">
                                    {decoded.signature}
                                </div>
                                <p className="mt-3 text-[10px] text-slate-600 italic">
                                    Nota: Esta utilidad solo decodifica el contenido. No verifica la validez de la firma criptográfica.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-600 text-center gap-3">
                            <Key size={32} className="opacity-20" />
                            <p className="text-xs italic">Ingresa un token JWT a la izquierda para analizar sus propiedades</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
