import React from 'react';
import { useWorkspace, AppView } from '../../context/WorkspaceContext';
import { useUIStore } from '../../stores/uiStore';

// Panels
import { ServicesView } from '../services/ServicesView';
import { GitPanel } from '../GitPanel';
import { JiraPanel } from '../JiraPanel';
import { ProcessesPanel } from '../ProcessesPanel';
import { ProxyPanel } from '../ProxyPanel';
import { FileServerPanel } from '../FileServerPanel';
import { TestsPanel } from '../TestsPanel';
import { SonarPanel } from '../SonarPanel';
import { CloudWatchPanel } from '../CloudWatchPanel';
import { HttpPanel } from '../http/HttpPanel';
import { JenkinsPanel } from '../JenkinsPanel';
import { LibCipherPanel } from '../LibCipherPanel';
import { MockPanel } from '../mocks/MockPanel';
import { JsonProcessorPanel } from '../json-processor/JsonProcessorPanel';
import { RegexTesterPanel } from '../regex/RegexTesterPanel';
import { NotesPanel } from '../notes/NotesPanel';
import { SwaggerPanel } from '../swagger/SwaggerPanel';
import { VisualDesigner } from '../designer/VisualDesigner';

interface UtilityRendererProps {
    view?: AppView;
}

export const UtilityRenderer: React.FC<UtilityRendererProps> = ({ view: forcedView }) => {
    const { state } = useWorkspace();
    const activeView = forcedView || state.activeView;

    const { 
        selectedProjects, setSelectedProjects,
        multiScript, setMultiScript,
        globalEnvName, setGlobalEnvName,
        vitePreviewOpen, setVitePreviewOpen
    } = useUIStore();

    switch (activeView) {
        case 'services':
            return (
                <ServicesView
                    selectedProjects={selectedProjects}
                    setSelectedProjects={setSelectedProjects}
                    multiScript={multiScript}
                    setMultiScript={setMultiScript}
                    globalEnvName={globalEnvName}
                    setGlobalEnvName={setGlobalEnvName}
                    vitePreviewOpen={vitePreviewOpen}
                    setVitePreviewOpen={setVitePreviewOpen}
                />
            );
        case 'git': return <GitPanel />;
        case 'jira': return <JiraPanel />;
        case 'processes': return <ProcessesPanel />;
        case 'proxy': return <ProxyPanel />;
        case 'fileServer': return <FileServerPanel />;
        case 'tests': return <TestsPanel />;
        case 'sonar': return <SonarPanel />;
        case 'cloudwatch': return <CloudWatchPanel />;
        case 'http': return <HttpPanel />;
        case 'jenkins': return <JenkinsPanel />;
        case 'lib-cipher': return <LibCipherPanel />;
        case 'mocks': return <MockPanel />;
        case 'json-processor': return <JsonProcessorPanel />;
        case 'regex': return <RegexTesterPanel />;
        case 'notes': return <NotesPanel />;
        case 'swagger': return <SwaggerPanel />;
        case 'designer': return <VisualDesigner />;
        default:
            return (
                <div className="flex items-center justify-center w-full h-full text-slate-500 italic">
                    Utilidad "{activeView}" no encontrada o en desarrollo.
                </div>
            );
    }
};
