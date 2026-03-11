import React from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { GitBranch, Trello, Server, Activity, Globe, FolderOpen, TerminalSquare, FlaskConical, BarChart3, Cloud, Network, Workflow, Package, Ghost, Braces } from 'lucide-react';

export const Sidebar: React.FC = () => {
    const { state, setActiveView } = useWorkspace();

    const renderNavIcon = (viewName: any, Icon: any, title: string) => {
        const isActive = state.activeView === viewName;
        return (
            <div
                onClick={() => setActiveView(viewName)}
                className={`p-2 rounded-md cursor-pointer transition-colors ${isActive ? 'bg-nexus-neon/10 text-nexus-neon' : 'text-slate-500 hover:text-slate-300'}`}
                title={title}
            >
                <Icon size={20} />
            </div>
        );
    };

    return (
        <div className="w-12 h-full bg-slate-950 flex flex-col items-center py-2 border-r border-slate-800 shrink-0 gap-1 relative z-20">
            {renderNavIcon('services', Server, "Services & Terminals")}
            {renderNavIcon('commands', TerminalSquare, "Commands")}
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
        </div>
    );
};
