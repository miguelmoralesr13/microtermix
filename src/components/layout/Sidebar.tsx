import React, { useRef, useState, useEffect } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useUIStore } from '../../stores/uiStore';
import { SettingsModal } from '../project/SettingsModal';
import { 
    Server, Activity, Globe, FolderOpen, FlaskConical, 
    Network, Package, Ghost, Cloud, Regex,
    ChevronUp, ChevronDown, ShieldAlert, Terminal, Palette, Code, Settings,
    LayoutDashboard
} from 'lucide-react';
import { 
    SiSonar, SiGit, SiJira, 
    SiJenkins, SiJson, SiSwagger, SiMarkdown, SiMermaid, SiDocker 
} from 'react-icons/si';

export const Sidebar: React.FC = () => {
    const { state, setActiveView } = useWorkspace();
    const { visibleUtilities } = useUIStore();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollUp, setCanScrollUp] = useState(false);
    const [canScrollDown, setCanScrollDown] = useState(false);

    const checkScroll = () => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        setCanScrollUp(scrollTop > 0);
        setCanScrollDown(Math.ceil(scrollTop + clientHeight) < scrollHeight);
    };

    useEffect(() => {
        checkScroll();
        window.addEventListener('resize', checkScroll);
        return () => window.removeEventListener('resize', checkScroll);
    }, []);

    const renderNavIcon = (viewName: any, Icon: any, title: string) => {
        if (visibleUtilities[viewName] === false) return null;
        const isActive = state.activeView === viewName;
        return (
            <div
                key={viewName}
                onClick={() => setActiveView(viewName)}
                className={`p-1.5 rounded-md cursor-pointer transition-all ${isActive ? 'bg-microtermix-neon/10 text-microtermix-neon' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                title={title}
            >
                <Icon size={isActive ? 18 : 16} />
            </div>
        );
    };

    return (
        <div className="w-10 h-full bg-slate-950 border-r border-white/5 shrink-0 relative flex flex-col z-20">
            {/* Indicador Superior */}
            <div className={`absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-slate-950 via-slate-950/90 to-transparent z-10 pointer-events-none flex justify-center pt-0.5 transition-opacity duration-300 ${canScrollUp ? 'opacity-100' : 'opacity-0'}`}>
                <ChevronUp size={10} className="text-microtermix-neon/70 animate-bounce" />
            </div>

            {/* Contenedor Icons */}
            <div
                ref={scrollRef}
                onScroll={checkScroll}
                className="w-full h-full overflow-y-auto flex flex-col items-center py-2 gap-0.5 scrollbar-none"
            >
                {renderNavIcon('services', Server, "Services & Terminals")}
                {renderNavIcon('tests', FlaskConical, "Tests & Coverage")}
                {renderNavIcon('sonar', SiSonar, "Sonar Analysis")}
                {renderNavIcon('semgrep', ShieldAlert, "Semgrep Security")}
                {renderNavIcon('git', SiGit, "Git")}
                {renderNavIcon('jira', SiJira, "Jira")}
                {renderNavIcon('processes', Activity, "Procesos en escucha")}
                {renderNavIcon('proxy', Globe, "Proxy reverso")}
                {renderNavIcon('http', Network, "HTTP Client")}
                {renderNavIcon('fileServer', FolderOpen, "Servidor de archivos")}
                {renderNavIcon('cloudwatch', Cloud, "AWS Manager (Logs, EC2, APIGW)")}
                {renderNavIcon('jenkins', SiJenkins, "Jenkins CI/CD")}
                {renderNavIcon('lib-cipher', Package, "Cifrado / Descifrado")}
                {renderNavIcon('mocks', Ghost, "Servidor de Mocks")}
                {renderNavIcon('json-processor', SiJson, "JSON Processor")}
                {renderNavIcon('regex', Regex, "Regex Laboratory")}
                {renderNavIcon('notes', SiMarkdown, "Notas Markdown")}
                {renderNavIcon('swagger', SiSwagger, "Swagger / OpenAPI Editor")}
                {renderNavIcon('designer', SiMermaid, "Visual Designer (Mermaid)")}
                {renderNavIcon('zeplin', Palette, "Zeplin Integration")}
                {renderNavIcon('template-compiler', Code, "Template Compiler")}
                {renderNavIcon('docker', SiDocker, "Docker Desktop / Orbstack")}
                
                {process.env.NODE_ENV === 'development' && (
                    <div className="w-6 h-px bg-white/5 my-1" />
                )}
                {process.env.NODE_ENV === 'development' && renderNavIcon('system', Terminal, "System & App Monitor")}
            </div>

            {/* Configuración */}
            <div className="w-full flex flex-col items-center py-2 border-t border-white/5">
                <SettingsModal trigger={
                    <div className="p-1.5 rounded-md cursor-pointer text-slate-500 hover:text-white hover:bg-white/5 transition-all" title="Settings">
                        <Settings size={16} />
                    </div>
                } />
            </div>

            {/* Indicador Inferior */}
            <div className={`absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent z-10 pointer-events-none flex justify-center items-end pb-0.5 transition-opacity duration-300 ${canScrollDown ? 'opacity-100' : 'opacity-0'}`}>
                <ChevronDown size={10} className="text-microtermix-neon/70 animate-bounce" />
            </div>
        </div>
    );
};
