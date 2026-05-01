import React from 'react';
import { useWorkspace, AppView } from '../../context/WorkspaceContext';
import { useUIStore } from '../../stores/uiStore';
import { useServiceManagerState } from '../../hooks/useServiceManagerState';

// Panels
import { ServicesView } from '../../services/ui/ServicesView';
import { GitPanel } from '../git/GitPanel';
import { JiraPanel } from '../jira/JiraPanel';
import { ProcessesPanel } from '../../processes/ui/ProcessesPanel';
import { ProxyPanel } from '../networking/ProxyPanel';
import { TestsPanel } from '../tests/TestsPanel';
import { SonarPanel } from '../sonar/SonarPanel';
import { CloudWatchPanel } from '../aws/CloudWatchPanel';
import { HttpPanel } from '../http/HttpPanel';
import { JenkinsPanel } from '../jenkins/JenkinsPanel';
import { LibCipherPanel } from '../lib-cipher/LibCipherPanel';
import { MockPanel } from '../mocks/MockPanel';
import { JsonProcessorPanel } from '../json-processor/JsonProcessorPanel';
import { RegexTesterPanel } from '../regex/RegexTesterPanel';
import { NotesPanel } from '../notes/NotesPanel';
import { SwaggerPanel } from '../swagger/SwaggerPanel';
import { VisualDesigner } from '../designer/VisualDesigner';
import { SemgrepPanel } from '../semgrep/SemgrepPanel';
import { SystemMonitorPanel } from '../system/SystemMonitorPanel';
import { ZeplinPanel } from '../zeplin/ZeplinPanel';
import { FileServerPanel } from '../networking/FileServerPanel';
import { TemplateCompilerPanel } from '../templates/TemplateCompilerPanel';
import { DockerPanel } from '../docker/DockerPanel';

interface UtilityRendererProps {
    view?: AppView;
}

export const UtilityRenderer: React.FC<UtilityRendererProps> = ({ view: forcedView }) => {
    // Run service manager state syncing for standalone windows
    useServiceManagerState();

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
        case 'semgrep': return <SemgrepPanel />;
        case 'system': return <SystemMonitorPanel />;
        case 'zeplin': return <ZeplinPanel />;
        case 'template-compiler': return <TemplateCompilerPanel />;
        case 'docker': return <DockerPanel />;
        default:
            return (
                <div className="flex items-center justify-center w-full h-full text-slate-500 italic">
                    Utilidad "{activeView}" no encontrada o en desarrollo.
                </div>
            );
    }
};
