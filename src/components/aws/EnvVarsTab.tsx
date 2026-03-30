import React, { useEffect, useState } from 'react';
import { 
    Search, RefreshCw, Eye, EyeOff, Copy, Check, Lock, Shield, Loader2
} from 'lucide-react';
import { useAwsEnvStore, SsmParameter, AwsSecret } from '../../stores/awsEnvStore';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { 
    Tabs, TabsList, TabsTrigger, TabsContent 
} from '../ui/tabs';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { invoke } from '@tauri-apps/api/core';

export const EnvVarsTab: React.FC = () => {
    const { 
        parameters, secrets, loading, error, 
        fetchParameters, fetchSecrets, 
        fetchParameterValue, fetchSecretValue 
    } = useAwsEnvStore();
    
    const [search, setSearch] = useState('');
    const [visibleValues, setVisibleValues] = useState<Record<string, boolean>>({});
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [fetchingKey, setFetchingKey] = useState<string | null>(null);

    useEffect(() => {
        fetchParameters();
        fetchSecrets();
    }, []);

    const handleToggleValue = async (name: string, type: 'ssm' | 'secret') => {
        if (visibleValues[name]) {
            setVisibleValues(prev => ({ ...prev, [name]: false }));
        } else {
            try {
                setFetchingKey(name);
                if (type === 'ssm') {
                    await fetchParameterValue(name);
                } else {
                    await fetchSecretValue(name);
                }
                setVisibleValues(prev => ({ ...prev, [name]: true }));
            } catch (err) {
                console.error('Error fetching value:', err);
                toast.error(`Error al cargar valor: ${name}`);
            } finally {
                setFetchingKey(null);
            }
        }
    };

    const copyToClipboard = async (text: string) => {
        try {
            await invoke('rust_copy_to_clipboard', { text });
            return true;
        } catch (err) {
            console.error('Rust Copy Error:', err);
            return false;
        }
    };

    const handleCopy = async (name: string, type: 'ssm' | 'secret', existingValue?: string) => {
        let val = existingValue;
        
        if (val) {
            const success = await copyToClipboard(val);
            if (success) {
                setCopiedKey(name);
                toast.success('Copiado', { duration: 1500 });
                setTimeout(() => setCopiedKey(null), 2000);
            }
            return;
        }

        try {
            setFetchingKey(name);
            toast.info('Obteniendo de AWS...', { duration: 1000 });
            if (type === 'ssm') {
                val = await fetchParameterValue(name);
            } else {
                val = await fetchSecretValue(name);
            }
            
            if (val) {
                const success = await copyToClipboard(val);
                if (success) {
                    setCopiedKey(name);
                    toast.success('Copiado');
                    setTimeout(() => setCopiedKey(null), 2000);
                }
            }
        } catch (err) {
            console.error('Error fetching for copy:', err);
            toast.error('Error al copiar');
        } finally {
            setFetchingKey(null);
        }
    };

    const filteredParams = parameters.filter(p => 
        p.name.toLowerCase().includes(search.toLowerCase())
    );

    const filteredSecrets = secrets.filter(s => 
        s.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full bg-slate-950 p-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                    <Input
                        placeholder="Buscar por nombre..."
                        className="pl-9 bg-slate-900 border-slate-800 text-slate-200"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <div className="text-[10px] text-slate-500 hidden sm:block italic">
                        Click: Ver • Click Derecho: Copiar
                    </div>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => { fetchParameters(); fetchSecrets(); }}
                        disabled={loading}
                        className="border-slate-800 text-slate-400 hover:text-slate-200"
                    >
                        <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                        Refrescar
                    </Button>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-900/20 border border-red-900/50 rounded text-red-400 text-sm">
                    {error}
                </div>
            )}

            <Tabs defaultValue="ssm" className="flex-1 flex flex-col min-h-0">
                <TabsList className="bg-slate-900 border-slate-800">
                    <TabsTrigger value="ssm" className="data-[state=active]:bg-slate-800">
                        <Lock className="h-3.5 w-3.5 mr-2" />
                        SSM Parameters ({filteredParams.length})
                    </TabsTrigger>
                    <TabsTrigger value="secrets" className="data-[state=active]:bg-slate-800">
                        <Shield className="h-3.5 w-3.5 mr-2" />
                        Secrets Manager ({filteredSecrets.length})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="ssm" className="flex-1 min-h-0 mt-4 overflow-auto">
                    <div className="space-y-2">
                        {filteredParams.map(p => (
                            <EnvItem 
                                key={p.name}
                                name={p.name}
                                subtext={p.type_}
                                value={p.value}
                                isVisible={!!visibleValues[p.name]}
                                isFetching={fetchingKey === p.name}
                                onToggle={() => handleToggleValue(p.name, 'ssm')}
                                onCopy={() => handleCopy(p.name, 'ssm', p.value)}
                                isCopied={copiedKey === p.name}
                                lastModified={p.last_modified}
                            />
                        ))}
                        {filteredParams.length === 0 && !loading && (
                            <div className="text-center py-10 text-slate-500 text-sm">
                                No se encontraron parámetros.
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="secrets" className="flex-1 min-h-0 mt-4 overflow-auto">
                    <div className="space-y-2">
                        {filteredSecrets.map(s => (
                            <EnvItem 
                                key={s.name}
                                name={s.name}
                                subtext={s.description || 'Sin descripción'}
                                value={s.value}
                                isVisible={!!visibleValues[s.name]}
                                isFetching={fetchingKey === s.name}
                                onToggle={() => handleToggleValue(s.name, 'secret')}
                                onCopy={() => handleCopy(s.name, 'secret', s.value)}
                                isCopied={copiedKey === s.name}
                                lastModified={s.last_modified}
                            />
                        ))}
                        {filteredSecrets.length === 0 && !loading && (
                            <div className="text-center py-10 text-slate-500 text-sm">
                                No se encontraron secretos.
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
};

interface EnvItemProps {
    name: string;
    subtext: string;
    value?: string;
    isVisible: boolean;
    isFetching: boolean;
    onToggle: () => void;
    onCopy: () => void;
    isCopied: boolean;
    lastModified: number | null;
}

const EnvItem: React.FC<EnvItemProps> = ({ 
    name, subtext, value, isVisible, isFetching, onToggle, onCopy, isCopied, lastModified 
}) => {
    // Usamos onMouseDown para detectar el botón derecho inmediatamente
    const handlePointerDown = (e: React.MouseEvent) => {
        if (e.button === 2) { // Botón derecho
            e.preventDefault();
            e.stopPropagation();
            onCopy();
        }
    };

    return (
        <div 
            onMouseDown={handlePointerDown}
            onContextMenu={(e) => e.preventDefault()} // Bloquea el menú nativo
            onClick={(e) => {
                // Solo activamos toggle si es el botón izquierdo (0)
                if (e.button === 0) onToggle();
            }}
            className={cn(
                "group flex flex-col p-3 bg-slate-900/50 border border-slate-800 rounded-md transition-all cursor-pointer select-none",
                "hover:border-slate-600 hover:bg-slate-900",
                isVisible && "border-slate-700 bg-slate-900 shadow-sm",
                isFetching && "opacity-80 border-blue-900/50"
            )}
        >
            <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-200 break-all">{name}</span>
                        {subtext === 'SecureString' && (
                            <Badge variant="outline" className="text-[10px] h-4 border-amber-900/50 text-amber-500 bg-amber-950/20">
                                Secure
                            </Badge>
                        )}
                        {isFetching && (
                            <Loader2 className="h-3 w-3 animate-spin text-microtermix-neon" />
                        )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                        {subtext} {lastModified && `• Modificado: ${new Date(lastModified * 1000).toLocaleString()}`}
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {isCopied && (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[9px] h-5 px-1.5 animate-in fade-in zoom-in duration-200">
                            Copiado
                        </Badge>
                    )}
                    <div className="flex items-center opacity-40 group-hover:opacity-100 transition-opacity">
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-slate-500 hover:text-slate-300 pointer-events-none"
                        >
                            {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-slate-500 hover:text-slate-300 pointer-events-none"
                        >
                            {isCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                        </Button>
                    </div>
                </div>
            </div>

            {isVisible && (
                <div 
                    onClick={(e) => e.stopPropagation()} 
                    className="mt-3 p-2 bg-slate-950 rounded border border-slate-800 font-mono text-xs text-microtermix-neon break-all whitespace-pre-wrap animate-in slide-in-from-top-1 duration-200"
                >
                    {value || (isFetching ? 'Cargando de AWS...' : '')}
                </div>
            )}
        </div>
    );
};
