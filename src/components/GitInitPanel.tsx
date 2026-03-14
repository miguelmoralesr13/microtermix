import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useGitStore } from '../stores/gitStore';
import { GitBranch, GitCommit, AlertTriangle, ChevronRight, Github, Gitlab } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface GitInitPanelProps {
    projectPath: string;
    initialStep?: 1 | 2;
    onInitialized: () => void;
}

export const GitInitPanel: React.FC<GitInitPanelProps> = ({ projectPath, initialStep, onInitialized }) => {
    const getActiveAccount = useGitStore(s => s.getActiveAccount);
    const activeAccount = getActiveAccount(projectPath);
    const activeProvider = activeAccount?.provider ?? 'none';
    const [step, setStep] = useState<1 | 2>(initialStep || 1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Step 2 Fields
    const [gitignoreContent, setGitignoreContent] = useState('node_modules/\ndist/\nbuild/\ntarget/\n.env\n.DS_Store\n');
    const [remoteType, setRemoteType] = useState<'provider' | 'custom'>(activeProvider !== 'none' ? 'provider' : 'custom');
    const [providerRepoName, setProviderRepoName] = useState(''); // E.g. "username/repo"
    const [customRemoteUrl, setCustomRemoteUrl] = useState('');
    const [commitMessage, setCommitMessage] = useState('Initial commit');

    const handleInit = async () => {
        setLoading(true);
        setError(null);
        try {
            const res: any = await invoke('git_execute', { projectPath, args: ['init'] });
            if (!res.success) throw new Error(res.stderr || 'Failed to initialize git repository');
            setStep(2);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleFinish = async () => {
        setLoading(true);
        setError(null);
        try {
            // 1. Write .gitignore
            if (gitignoreContent.trim()) {
                await invoke('write_file_content', {
                    base: projectPath,
                    file: '.gitignore',
                    content: gitignoreContent.trim() + '\n'
                });
            }

            // 2. Add files
            const addRes: any = await invoke('git_execute', { projectPath, args: ['add', '.'] });
            if (!addRes.success) throw new Error(addRes.stderr || 'Failed to add files to staging');

            // 3. Make initial commit
            const commitRes: any = await invoke('git_execute', { projectPath, args: ['commit', '-m', commitMessage] });
            if (!commitRes.success) throw new Error(commitRes.stderr || 'Failed to commit files');

            // 4. Set Branch to main (optional but good practice)
            await invoke('git_execute', { projectPath, args: ['branch', '-M', 'main'] });

            // 5. Add remote if provided
            let finalOutputUrl = '';
            if (remoteType === 'provider' && providerRepoName.trim()) {
                const provider = activeProvider;
                let baseUrl = '';
                if (provider === 'github') baseUrl = 'github.com';
                else if (provider === 'gitlab') baseUrl = 'gitlab.com';

                if (baseUrl) {
                    let cleanRepo = providerRepoName.trim();
                    if (cleanRepo.startsWith('http') || cleanRepo.startsWith('git@')) {
                        finalOutputUrl = cleanRepo;
                    } else {
                        // E.g. https://github.com/user/repo.git
                        finalOutputUrl = `https://${baseUrl}/${cleanRepo.replace('.git', '')}.git`;
                    }
                }
            } else if (remoteType === 'custom' && customRemoteUrl.trim()) {
                finalOutputUrl = customRemoteUrl.trim();
            }

            if (finalOutputUrl) {
                const remoteRes: any = await invoke('git_execute', { projectPath, args: ['remote', 'add', 'origin', finalOutputUrl] });
                if (!remoteRes.success) throw new Error(remoteRes.stderr || 'Failed to add remote origin');
            }

            onInitialized();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto w-full h-full bg-slate-900 flex justify-center py-12 px-6">
            <div className="max-w-2xl w-full">
                <div className="mb-8 overflow-hidden text-center block">
                    <h2 className="text-2xl font-bold text-white flex items-center justify-center mb-2">
                        <GitBranch className="text-microtermix-neon mr-3" size={28} />
                        Repository Setup
                    </h2>
                    <p className="text-slate-400 text-sm">Convert this folder into a Git repository and jumpstart your version control workflow.</p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-microtermix-danger/10 border border-microtermix-danger/20 rounded-lg flex items-start">
                        <AlertTriangle className="text-microtermix-danger shrink-0 mr-3 mt-0.5" size={18} />
                        <div className="text-sm text-microtermix-danger whitespace-pre-wrap">{error}</div>
                    </div>
                )}

                {/* Step 1: Init */}
                <div className={`transition-all duration-300 ${step === 1 ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-6 flex flex-col items-center justify-center min-h-[160px]">
                        <h3 className="text-lg font-bold text-slate-200 mb-2">Step 1: Initialize Git</h3>
                        <p className="text-sm text-slate-400 text-center mb-6">This will create a hidden <code>.git</code> folder and start tracking changes.</p>
                        <Button
                            onClick={handleInit}
                            disabled={loading || step !== 1}
                            className="bg-microtermix-accent hover:bg-microtermix-accent/80 text-white font-bold h-11 px-8 rounded shadow-lg transition-all"
                        >
                            <GitCommit className="mr-2" size={18} />
                            {loading && step === 1 ? 'Initializing...' : 'Initialize Repository'}
                        </Button>
                    </div>
                </div>

                {/* Step 2: Configuration */}
                {step === 2 && (
                    <div className="mt-6 bg-slate-950 border border-slate-800 rounded-lg p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h3 className="text-lg font-bold text-slate-200 mb-6 flex items-center">
                            Step 2: Configuration & First Commit
                        </h3>

                        <div className="space-y-6">
                            {/* Gitignore */}
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Configure <code>.gitignore</code></label>
                                <p className="text-xs text-slate-500 mb-2">Review and edit the files/folders you want Git to ignore.</p>
                                <Textarea
                                    value={gitignoreContent}
                                    onChange={e => setGitignoreContent(e.target.value)}
                                    className="resize-none w-full bg-slate-900 border-slate-700 text-slate-300 font-mono text-xs min-h-[100px]"
                                    placeholder="node_modules/&#10;.env"
                                />
                            </div>

                            {/* Remote Origin */}
                            <div className="border-t border-slate-800 pt-6">
                                <label className="block text-sm font-medium text-slate-300 mb-3">Add Remote Origin (Optional)</label>

                                <div className="flex bg-slate-900 p-1 rounded-lg mb-4 w-fit">
                                    {activeProvider !== 'none' && (
                                        <Button
                                            variant="ghost"
                                            onClick={() => setRemoteType('provider')}
                                            className={`h-8 px-4 text-xs font-bold transition-all ${remoteType === 'provider' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            Use {activeProvider === 'github' ? 'GitHub' : activeProvider === 'gitlab' ? 'GitLab' : 'Provider'}
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost"
                                        onClick={() => setRemoteType('custom')}
                                        className={`h-8 px-4 text-xs font-bold transition-all ${remoteType === 'custom' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        Custom URL
                                    </Button>
                                </div>

                                {remoteType === 'provider' && activeProvider !== 'none' ? (
                                    <div className="flex flex-col space-y-2">
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                {activeProvider === 'github' && <Github size={16} className="text-slate-500" />}
                                                {activeProvider === 'gitlab' && <Gitlab size={16} className="text-slate-500" />}
                                            </div>
                                            <Input
                                                type="text"
                                                value={providerRepoName}
                                                onChange={e => setProviderRepoName(e.target.value)}
                                                placeholder="username/repository-name"
                                                className="w-full bg-slate-900 border-slate-700 pl-10 h-9 text-sm"
                                            />
                                        </div>
                                        {providerRepoName && (
                                            <p className="text-[10px] text-slate-500 font-mono pl-1 break-all">
                                                Will use: {providerRepoName.trim().startsWith('http') || providerRepoName.trim().startsWith('git@') ? providerRepoName.trim() : `https://${activeProvider === 'github' ? 'github.com' : activeProvider === 'gitlab' ? 'gitlab.com' : 'bitbucket.org'}/${providerRepoName.trim().replace('.git', '')}.git`}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <Input
                                        type="url"
                                        value={customRemoteUrl}
                                        onChange={e => setCustomRemoteUrl(e.target.value)}
                                        placeholder="https://github.com/user/project.git"
                                        className="w-full bg-slate-900 border-slate-700 h-9 text-sm"
                                    />
                                )}
                            </div>

                            {/* Initial Commit Message */}
                            <div className="border-t border-slate-800 pt-6">
                                <label className="block text-sm font-medium text-slate-300 mb-2">Initial Commit Message</label>
                                <Input
                                    type="text"
                                    value={commitMessage}
                                    onChange={e => setCommitMessage(e.target.value)}
                                    placeholder="Initial commit"
                                    className="w-full bg-slate-900 border-slate-700 h-9 text-sm"
                                />
                            </div>

                            <Button
                                onClick={handleFinish}
                                disabled={loading || !commitMessage.trim()}
                                className="w-full bg-microtermix-neon hover:bg-microtermix-neon/80 text-black font-bold h-12 rounded shadow-lg transition-all mt-4"
                            >
                                {loading ? (
                                    'Processing...'
                                ) : (
                                    <>
                                        Finish Setup <ChevronRight className="ml-2" size={18} />
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
