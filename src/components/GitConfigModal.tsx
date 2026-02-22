import React, { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Github, Gitlab, Server, X } from 'lucide-react';

interface GitConfigModalProps {
    onClose: () => void;
}

export const GitConfigModal: React.FC<GitConfigModalProps> = ({ onClose }) => {
    const { state, setGitConfig } = useWorkspace();
    const [provider, setProvider] = useState<'gitlab' | 'github' | 'bitbucket'>(
        state.gitConfig.provider === 'none' ? 'gitlab' : state.gitConfig.provider
    );

    const [drafts, setDrafts] = useState({
        gitlab: {
            url: state.gitConfig.provider === 'gitlab' ? state.gitConfig.url : 'https://gitlab.com',
            token: state.gitConfig.provider === 'gitlab' ? state.gitConfig.token : ''
        },
        github: {
            url: state.gitConfig.provider === 'github' ? state.gitConfig.url : 'https://api.github.com',
            token: state.gitConfig.provider === 'github' ? state.gitConfig.token : ''
        },
        bitbucket: {
            url: state.gitConfig.provider === 'bitbucket' ? state.gitConfig.url : 'https://api.bitbucket.org/2.0',
            token: state.gitConfig.provider === 'bitbucket' ? state.gitConfig.token : ''
        }
    });

    const url = drafts[provider].url;
    const token = drafts[provider].token;

    const updateDraft = (field: 'url' | 'token', value: string) => {
        setDrafts(prev => ({
            ...prev,
            [provider]: { ...prev[provider], [field]: value }
        }));
    };

    const handleSave = () => {
        setGitConfig({ provider, url, token });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-700 w-[500px] rounded-xl shadow-2xl p-6 relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>

                <h2 className="text-xl font-bold text-white mb-6 flex items-center">
                    <Server className="text-nexus-neon mr-3" /> Configure Git Provider
                </h2>

                <div className="space-y-6">
                    {/* Provider Selection */}
                    <div className="grid grid-cols-3 gap-3">
                        <button
                            onClick={() => setProvider('gitlab')}
                            className={`flex flex-col items-center justify-center py-4 rounded-lg border transition-all ${provider === 'gitlab' ? 'border-nexus-accent bg-nexus-accent/10 text-white' : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500'}`}
                        >
                            <Gitlab size={28} className="mb-2" />
                            <span className="text-sm font-semibold">GitLab</span>
                        </button>
                        <button
                            onClick={() => setProvider('github')}
                            className={`flex flex-col items-center justify-center py-4 rounded-lg border transition-all ${provider === 'github' ? 'border-nexus-accent bg-nexus-accent/10 text-white' : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500'}`}
                        >
                            <Github size={28} className="mb-2" />
                            <span className="text-sm font-semibold">GitHub</span>
                        </button>
                        <button
                            onClick={() => setProvider('bitbucket')}
                            className={`flex flex-col items-center justify-center py-4 rounded-lg border transition-all opacity-50 cursor-not-allowed ${provider === 'bitbucket' ? 'border-nexus-accent bg-nexus-accent/10 text-white' : 'border-slate-700 bg-slate-800/50 text-slate-400'}`}
                            disabled
                            title="Coming Soon..."
                        >
                            <Server size={28} className="mb-2" />
                            <span className="text-sm font-semibold">Bitbucket</span>
                            <span className="text-[10px] text-slate-500 mt-1">Coming Soon</span>
                        </button>
                    </div>

                    {/* Form Fields */}
                    {(provider === 'gitlab' || provider === 'github') && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">
                                    {provider === 'github' ? 'API URL (Optional)' : 'Instance URL'}
                                </label>
                                <input
                                    type="url"
                                    value={url}
                                    onChange={e => updateDraft('url', e.target.value)}
                                    placeholder={provider === 'github' ? 'https://api.github.com' : 'https://gitlab.com'}
                                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-nexus-neon"
                                />
                                {provider === 'github' && (
                                    <p className="text-xs text-slate-500 mt-1">Leave as default or change for GitHub Enterprise.</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Personal Access Token (PAT)</label>
                                <input
                                    type="password"
                                    value={token}
                                    onChange={e => updateDraft('token', e.target.value)}
                                    placeholder={provider === 'github' ? 'ghp_xxxxxxxxxxxxxxxxxxxx' : 'glpat-xxxxxxxxxxxxxxxxxxxx'}
                                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-nexus-neon font-mono text-sm"
                                />
                                <p className="text-xs text-slate-500 mt-2">
                                    {provider === 'github'
                                        ? 'Requires `repo` scope. This is stored locally and never leaves your machine.'
                                        : 'Requires `api`, `read_repository`, and `write_repository` scopes. This is stored locally and never leaves your machine.'}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                        <button
                            onClick={() => {
                                setGitConfig({ provider: 'none', url: '', token: '' });
                                onClose();
                            }}
                            className="px-4 py-2 rounded text-slate-300 hover:bg-slate-800 transition-colors text-sm font-medium shadow"
                        >
                            Disconnect
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!url || !token}
                            className={`px-6 py-2 rounded text-slate-900 font-bold text-sm transition-all shadow ${!url || !token ? 'bg-slate-600 opacity-50 cursor-not-allowed' : 'bg-nexus-neon hover:bg-opacity-80'}`}
                        >
                            Save Settings
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
