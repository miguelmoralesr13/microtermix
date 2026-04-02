import React, { useEffect, useState, useTransition, useMemo } from 'react';
import { 
    FileJson, Code, Eye, Trash2, Copy, 
    Check, AlertCircle, Wand2, Zap, Palette
} from 'lucide-react';
import { useTemplateStore, TemplateEngineType } from '../../stores/templateStore';
import { TemplateEngineFactory } from './TemplateEngineFactory';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

// Shared Layout Components
import { ResizablePanel } from '../http/ResizablePanel';
import { EditorPanel } from './EditorPanel';

export const TemplateCompilerPanel: React.FC = () => {
    const { 
        template, setTemplate, 
        data, setData, 
        css, setCss,
        engine, setEngine, 
        autoDetect, setAutoDetect, 
        output, setOutput, 
        error, setError,
        reset
    } = useTemplateStore();

    const [compiling, setCompiling] = useState(false);
    const [copied, setCopied] = useState(false);
    const [activeTab, setActiveTab] = useState<'data' | 'css'>('data');
    const [isPending, startTransition] = useTransition();

    // Compilation logic with performance optimizations
    useEffect(() => {
        const timeout = setTimeout(async () => {
            if (!template) {
                setOutput('');
                return;
            }

            setCompiling(true);
            try {
                const parsedData = JSON.parse(data || '{}');
                
                if (autoDetect) {
                    const detected = TemplateEngineFactory.detectEngine(template);
                    if (detected && detected !== engine) {
                        setEngine(detected);
                    }
                }

                const engineInstance = TemplateEngineFactory.getEngine(engine);
                const rawHtml = await engineInstance.compile(template, parsedData);
                
                startTransition(() => {
                    setOutput(rawHtml);
                });
                
                setError(null);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setCompiling(false);
            }
        }, 600); 

        return () => clearTimeout(timeout);
    }, [template, data, engine, autoDetect, setOutput, setError, setEngine]);

    const handleBootstrap = () => {
        const seed = TemplateEngineFactory.getSeed(engine);
        setTemplate(seed.template);
        setData(seed.data);
        setCss(seed.css);
        toast.info(`Cargada plantilla de ejemplo para ${engine.toUpperCase()}`, {
            description: "Puedes modificar los datos y estilos para ver los cambios en tiempo real.",
            icon: <Wand2 className="w-4 h-4 text-microtermix-neon" />
        });
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(output);
        setCopied(true);
        toast.success('HTML copiado al portapapeles');
        setTimeout(() => setCopied(false), 2000);
    };

    const ENGINES: { id: TemplateEngineType; label: string }[] = [
        { id: 'ejs', label: 'EJS' },
        { id: 'mustache', label: 'Mustache' },
        { id: 'liquid', label: 'Liquid' },
        { id: 'pug', label: 'Pug' },
    ];

    const renderedContent = useMemo(() => {
        if (!output) return '<p class="text-slate-400 italic">Esperando contenido...</p>';
        return `<style>${css}</style>\n${output}`;
    }, [output, css]);

    return (
        <div className="flex-1 flex flex-col h-full w-full bg-slate-950 font-sans text-slate-300 overflow-hidden">
            
            {/* Header / Toolbar */}
            <header className="shrink-0 h-14 border-b border-white/5 bg-slate-900/40 backdrop-blur-md flex items-center justify-between px-6 z-20">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-microtermix-neon/10 rounded-xl">
                        <Code className="w-5 h-5 text-microtermix-neon" />
                    </div>
                    <div>
                        <h1 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                            Template Hub <Badge variant="outline" className="text-[9px] h-4 border-microtermix-neon/20 text-microtermix-neon">Premium</Badge>
                        </h1>
                        <p className="text-[10px] text-slate-500 font-medium">Motor de plantillas con soporte para datos y estilos</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex bg-black/40 p-1 rounded-lg border border-white/5 items-center gap-1">
                        {ENGINES.map((e) => (
                            <button
                                key={e.id}
                                onClick={() => { setEngine(e.id); setAutoDetect(false); }}
                                className={cn(
                                    "px-3 py-1 text-[10px] font-black rounded-md transition-all uppercase tracking-tighter",
                                    engine === e.id 
                                        ? "bg-microtermix-neon text-microtermix-darker shadow-lg shadow-microtermix-neon/20" 
                                        : "text-slate-500 hover:text-slate-300"
                                )}
                            >
                                {e.label}
                            </button>
                        ))}
                    </div>

                    <div className="h-6 w-px bg-white/5 mx-2" />

                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setAutoDetect(!autoDetect)}
                        className={cn("h-8 text-[10px] font-black uppercase tracking-widest gap-2", autoDetect ? "text-microtermix-neon" : "text-slate-500")}
                    >
                        <Zap className={cn("w-3 h-3", autoDetect && "fill-current")} />
                        Auto-Detect
                    </Button>

                    <Button variant="ghost" size="icon-xs" onClick={reset} className="text-slate-500 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </header>

            {/* Main Content Areas */}
            <main className="flex-1 overflow-hidden relative">
                <ResizablePanel direction="horizontal" initialSize={420} minSize={300}>
                    
                    {/* Reusable Editor Container for Template */}
                    <EditorPanel
                        title="Plantilla Source"
                        icon={Code}
                        value={template}
                        onChange={setTemplate}
                        language={engine === 'pug' ? 'pug' : 'html'}
                        isLoading={compiling}
                        loadingTitle="Compilando..."
                        headerRight={
                            <Button 
                                variant="ghost" 
                                size="xs" 
                                onClick={handleBootstrap}
                                className="h-6 text-[9px] font-black uppercase tracking-widest gap-2 bg-microtermix-neon/10 text-microtermix-neon hover:bg-microtermix-neon/20 border border-microtermix-neon/20"
                            >
                                <Wand2 className="w-3 h-3" />
                                Magic Bootstrap
                            </Button>
                        }
                    />

                    <ResizablePanel direction="horizontal" initialSize={320} minSize={250}>
                        {/* Middle Panel with Toggle-able EditorPanel */}
                        <div className="flex flex-col h-full bg-slate-950/20 border-r border-white/5">
                            <div className="shrink-0 h-10 px-1 border-b border-white/5 bg-black/20 flex items-center gap-0.5">
                                <Button 
                                    variant="ghost" 
                                    className={cn(
                                        "h-full text-[9px] font-black rounded-none border-b-2 uppercase tracking-tight px-3 gap-2 transition-all", 
                                        activeTab === 'data' ? "border-microtermix-neon text-white bg-white/5" : "border-transparent text-slate-500 hover:text-slate-300"
                                    )}
                                    onClick={() => setActiveTab('data')}
                                >
                                    <FileJson size={13} /> JSON Context
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    className={cn(
                                        "h-full text-[9px] font-black rounded-none border-b-2 uppercase tracking-tight px-3 gap-2 transition-all", 
                                        activeTab === 'css' ? "border-microtermix-accent text-white bg-white/5" : "border-transparent text-slate-500 hover:text-slate-300"
                                    )}
                                    onClick={() => setActiveTab('css')}
                                >
                                    <Palette size={13} /> Custom CSS
                                </Button>
                            </div>
                            
                            <div className="flex-1 relative">
                                {activeTab === 'data' ? (
                                    <EditorPanel
                                        title="JSON Config"
                                        icon={FileJson}
                                        value={data}
                                        onChange={setData}
                                        language="json"
                                        className="border-none" // Remove internal border since it's nested
                                    />
                                ) : (
                                    <EditorPanel
                                        title="Editor Estilos"
                                        icon={Palette}
                                        value={css}
                                        onChange={setCss}
                                        language="css"
                                        className="border-none"
                                    />
                                )}
                            </div>
                        </div>

                        {/* Right Panel: HTML Preview (Unique renderer, not a Monaco Editor) */}
                        <div className="flex flex-col h-full bg-slate-900/40 relative">
                            <div className="shrink-0 h-10 px-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                                <div className="flex items-center gap-2">
                                    <Eye className="w-3.5 h-3.5 text-microtermix-neon" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Respuesta HTML</span>
                                </div>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={copyToClipboard}
                                    className="h-7 text-[9px] font-black uppercase tracking-widest gap-2 bg-white/5 hover:bg-microtermix-neon/10"
                                >
                                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                    {copied ? 'Copiado' : 'Copy HTML'}
                                </Button>
                            </div>
                            
                            <div className="flex-1 overflow-auto bg-white text-slate-900 p-8 shadow-inner relative group">
                                {error ? (
                                    <div className="h-full flex flex-col items-center justify-center p-8 text-center gap-4">
                                        <div className="p-4 bg-red-500/10 rounded-full">
                                            <AlertCircle className="w-10 h-10 text-red-500" />
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-black uppercase tracking-tighter text-red-600">Error de Compilación</h4>
                                            <pre className="text-[10px] font-mono text-red-500 max-w-md break-words whitespace-pre-wrap">
                                                {error}
                                            </pre>
                                        </div>
                                    </div>
                                ) : (
                                    <div 
                                        className={cn("prose prose-sm max-w-none animate-in fade-in duration-300", isPending && "opacity-60")}
                                        dangerouslySetInnerHTML={{ __html: renderedContent }} 
                                    />
                                )}

                                {compiling && (
                                    <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                                        <Wand2 className="w-8 h-8 text-microtermix-neon animate-bounce" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </ResizablePanel>
                </ResizablePanel>
            </main>
        </div>
    );
};
