import React, { useRef, useState, useEffect } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useUIStore } from '../../stores/uiStore';
import { SettingsModal } from '../SettingsModal';
import { 
    Server, Activity, Globe, FolderOpen, FlaskConical, 
    Network, Package, Ghost,  Cloud, Regex,
    ChevronUp, ChevronDown, ShieldAlert, Terminal, Palette,
    Settings
} from 'lucide-react';
import { 
    SiSonar, SiGit, SiJira, 
    SiJenkins, SiJson, SiSwagger, SiMarkdown, SiMermaid 
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
                className={`p-2 rounded-md cursor-pointer transition-colors ${isActive ? 'bg-microtermix-neon/10 text-microtermix-neon' : 'text-slate-500 hover:text-slate-300'}`}
                title={title}
            >
                <Icon size={isActive ? 22 : 20} />
            </div>
        );
    };

    return (
        <div className="w-12 h-full bg-slate-950 border-r border-slate-800 shrink-0 relative flex flex-col z-20">
            {/* Indicador Superior */}
            <div className={`absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-slate-950 via-slate-950/90 to-transparent z-10 pointer-events-none flex justify-center pt-1 transition-opacity duration-300 ${canScrollUp ? 'opacity-100' : 'opacity-0'}`}>
                <ChevronUp size={12} className="text-microtermix-neon/70 animate-bounce" />
            </div>

            {/* Contenedor Icons */}
            <div
                ref={scrollRef}
                onScroll={checkScroll}
                className="w-full h-full overflow-y-auto flex flex-col items-center py-4 gap-1 scrollbar-none"
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
                
                {process.env.NODE_ENV === 'development' && (
                    <div className="w-8 h-px bg-slate-800 my-2" />
                )}
                {process.env.NODE_ENV === 'development' && renderNavIcon('system', Terminal, "System & App Monitor")}
            </div>

            {/* Configuración */}
            <div className="w-full flex flex-col items-center py-4 border-t border-slate-800">
                <SettingsModal />
            </div>

            {/* Indicador Inferior */}
            <div className={`absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent z-10 pointer-events-none flex justify-center items-end pb-1 transition-opacity duration-300 ${canScrollDown ? 'opacity-100' : 'opacity-0'}`}>
                <ChevronDown size={12} className="text-microtermix-neon/70 animate-bounce" />
            </div>
        </div>
    );
};
