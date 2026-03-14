import React, { useRef, useState, useEffect } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { GitBranch, Trello, Server, Activity, Globe, FolderOpen, FlaskConical, BarChart3, Cloud, Network, Workflow, Package, Ghost, Braces, NotebookPen, FileCode2, ChevronUp, ChevronDown,  Palette } from 'lucide-react';

export const Sidebar: React.FC = () => {
    const { state, setActiveView } = useWorkspace();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollUp, setCanScrollUp] = useState(false);
    const [canScrollDown, setCanScrollDown] = useState(false);

    const checkScroll = () => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        setCanScrollUp(scrollTop > 0);
        // Usamos una pequeña tolerancia (1px) para evitar problemas de redondeo
        setCanScrollDown(Math.ceil(scrollTop + clientHeight) < scrollHeight);
    };

    useEffect(() => {
        // Verificar el estado inicial al montar
        checkScroll();
        window.addEventListener('resize', checkScroll);
        return () => window.removeEventListener('resize', checkScroll);
    }, []);

    const renderNavIcon = (viewName: any, Icon: any, title: string) => {
        const isActive = state.activeView === viewName;
        return (
            <div
                key={viewName}
                onClick={() => setActiveView(viewName)}
                className={`p-2 rounded-md cursor-pointer transition-colors ${isActive ? 'bg-microtermix-neon/10 text-microtermix-neon' : 'text-slate-500 hover:text-slate-300'}`}
                title={title}
            >
                <Icon size={20} />
            </div>
        );
    };

    return (
        <div className="w-12 h-full bg-slate-950 border-r border-slate-800 shrink-0 relative flex flex-col z-20">
            {/* Indicador Superior Animado */}
            <div className={`absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-slate-950 via-slate-950/90 to-transparent z-10 pointer-events-none flex justify-center pt-1 transition-opacity duration-300 ${canScrollUp ? 'opacity-100' : 'opacity-0'}`}>
                <ChevronUp size={12} className="text-microtermix-neon/70 animate-bounce" />
            </div>

            {/* Contenedor con Scrollbar Oculta */}
            <div
                ref={scrollRef}
                onScroll={checkScroll}
                className="w-full h-full overflow-y-auto flex flex-col items-center py-4 gap-1 scrollbar-none"
            >
                {renderNavIcon('services', Server, "Services & Terminals")}
                {renderNavIcon('tests', FlaskConical, "Tests & Coverage")}
                {renderNavIcon('sonar', BarChart3, "Sonar Analysis")}
                {renderNavIcon('git', GitBranch, "Git")}
                {renderNavIcon('jira', Trello, "Jira")}
                {renderNavIcon('processes', Activity, "Procesos en escucha")}
                {renderNavIcon('proxy', Globe, "Proxy reverso")}
                {renderNavIcon('http', Network, "HTTP Client")}
                {renderNavIcon('fileServer', FolderOpen, "Servidor de archivos")}
                {renderNavIcon('cloudwatch', Cloud, "AWS Manager (Logs, EC2, APIGW)")}
                {renderNavIcon('jenkins', Workflow, "Jenkins CI/CD")}
                {renderNavIcon('lib-cipher', Package, "Cifrado / Descifrado")}
                {renderNavIcon('mocks', Ghost, "Servidor de Mocks")}
                {renderNavIcon('json-processor', Braces, "JSON Processor")}
                {renderNavIcon('notes', NotebookPen, "Notas Markdown")}
                {renderNavIcon('swagger', FileCode2, "Swagger / OpenAPI Editor")}
                {renderNavIcon('designer', Palette, "Visual Designer (Mermaid)")}
            </div>

            {/* Indicador Inferior Animado */}
            <div className={`absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent z-10 pointer-events-none flex justify-center items-end pb-1 transition-opacity duration-300 ${canScrollDown ? 'opacity-100' : 'opacity-0'}`}>
                <ChevronDown size={12} className="text-microtermix-neon/70 animate-bounce" />
            </div>
        </div>
    );
};

