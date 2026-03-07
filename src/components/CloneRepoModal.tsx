import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Github, Gitlab, Star, Download, Search, Lock, Globe, RefreshCw, AlertTriangle, FolderGit2, ExternalLink } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useGitStore, type CloneFavorite } from '../stores/gitStore';
import { useWorkspace } from '../context/WorkspaceContext';
import { fetchUserGithubRepos, searchGithubRepos, type GithubRepo } from '../services/githubApi';
import { fetchUserGitlabProjects, searchGitlabProjects, type GitlabProject } from '../services/gitlabApi';

interface CloneRepoModalProps {
    onClose: () => void;
}

interface NormalizedRepo {
    id: string;         // full_name for github, path_with_namespace for gitlab
    name: string;
    fullName: string;
    description: string | null;
    htmlUrl: string;
    cloneUrl: string;
    isPrivate: boolean;
    language: string | null;
    stars: number;
    provider: 'github' | 'gitlab';
}

function normalizeGithubRepo(r: GithubRepo): NormalizedRepo {
    return {
        id: r.full_name,
        name: r.name,
        fullName: r.full_name,
        description: r.description,
        htmlUrl: r.html_url,
        cloneUrl: r.clone_url,
        isPrivate: r.private,
        language: r.language,
        stars: r.stargazers_count,
        provider: 'github',
    };
}

function normalizeGitlabProject(p: GitlabProject): NormalizedRepo {
    return {
        id: p.path_with_namespace,
        name: p.name,
        fullName: p.path_with_namespace,
        description: p.description,
        htmlUrl: p.web_url,
        cloneUrl: p.http_url_to_repo,
        isPrivate: p.visibility === 'private',
        language: null,
        stars: p.star_count,
        provider: 'gitlab',
    };
}

export const CloneRepoModal: React.FC<CloneRepoModalProps> = ({ onClose }) => {
    const { state } = useWorkspace();
    const accounts = useGitStore(s => s.accounts);
    const cloneFavorites = useGitStore(s => s.cloneFavorites);
    const addCloneFavorite = useGitStore(s => s.addCloneFavorite);
    const removeCloneFavorite = useGitStore(s => s.removeCloneFavorite);

    const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id ?? '');
    const [search, setSearch] = useState('');
    const [repos, setRepos] = useState<NormalizedRepo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [cloningId, setCloningId] = useState<string | null>(null);
    const [cloneSuccess, setCloneSuccess] = useState<string | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const selectedAccount = accounts.find(a => a.id === selectedAccountId);

    const loadRepos = useCallback(async (query?: string) => {
        if (!selectedAccount) return;
        setLoading(true);
        setError(null);
        setRepos([]);
        try {
            if (selectedAccount.provider === 'github') {
                const data = query
                    ? await searchGithubRepos(selectedAccount.url, selectedAccount.token, query)
                    : await fetchUserGithubRepos(selectedAccount.url, selectedAccount.token);
                setRepos(data.map(normalizeGithubRepo));
            } else {
                const data = query
                    ? await searchGitlabProjects(selectedAccount.url, selectedAccount.token, query)
                    : await fetchUserGitlabProjects(selectedAccount.url, selectedAccount.token);
                setRepos(data.map(normalizeGitlabProject));
            }
        } catch (e: any) {
            setError(e.message || 'Error fetching repositories');
        } finally {
            setLoading(false);
        }
    }, [selectedAccount]);

    useEffect(() => {
        setSearch('');
        setRepos([]);
        setError(null);
        if (selectedAccount) loadRepos();
    }, [selectedAccountId]);

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const q = search.trim();
            loadRepos(q || undefined);
        }
    };

    const handleClone = async (repo: NormalizedRepo) => {
        if (!state.currentPath) return;
        setCloningId(repo.id);
        setCloneSuccess(null);
        try {
            const res: any = await invoke('git_execute', {
                projectPath: state.currentPath,
                args: ['clone', repo.cloneUrl],
            });
            if (!res.success) throw new Error(res.stderr || 'Clone failed');
            setCloneSuccess(repo.fullName);
        } catch (e: any) {
            setError(`Clone failed: ${e.message}`);
        } finally {
            setCloningId(null);
        }
    };

    const isFav = (id: string) => cloneFavorites.some(f => f.id === id);

    const toggleFav = (repo: NormalizedRepo) => {
        if (isFav(repo.id)) {
            removeCloneFavorite(repo.id);
        } else {
            const fav: CloneFavorite = {
                id: repo.id,
                name: repo.name,
                fullName: repo.fullName,
                cloneUrl: repo.cloneUrl,
                htmlUrl: repo.htmlUrl,
                provider: repo.provider,
                private: repo.isPrivate,
            };
            addCloneFavorite(fav);
        }
    };

    const providerFavs = cloneFavorites.filter(f => f.provider === selectedAccount?.provider);

    const allRepos = repos;

    if (accounts.length === 0) {
        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-slate-900 border border-slate-700 w-[480px] rounded-xl shadow-2xl p-8 text-center">
                    <FolderGit2 className="mx-auto text-slate-500 mb-4" size={40} />
                    <h2 className="text-white font-bold text-base mb-2">No hay cuentas configuradas</h2>
                    <p className="text-slate-400 text-sm mb-4">Agrega una cuenta de GitHub o GitLab desde el panel de Git para poder clonar repositorios.</p>
                    <button onClick={onClose} className="px-4 py-2 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm transition-colors">Cerrar</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-700 w-[640px] max-h-[85vh] rounded-xl shadow-2xl flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-2">
                        <Download size={16} className="text-nexus-neon" />
                        <h2 className="text-base font-bold text-white">Clonar Repositorio</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Account selector + Search */}
                <div className="px-5 py-3 border-b border-slate-800 shrink-0 space-y-2">
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-500 shrink-0">Cuenta:</label>
                        <select
                            value={selectedAccountId}
                            onChange={e => setSelectedAccountId(e.target.value)}
                            className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-nexus-neon"
                        >
                            {accounts.map(a => (
                                <option key={a.id} value={a.id}>
                                    [{a.provider === 'github' ? 'GitHub' : 'GitLab'}] {a.alias}
                                </option>
                            ))}
                        </select>
                        {selectedAccount && (
                            <span className="shrink-0">
                                {selectedAccount.provider === 'github'
                                    ? <Github size={15} className="text-slate-400" />
                                    : <Gitlab size={15} className="text-orange-400" />
                                }
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                            <input
                                ref={searchRef}
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                onKeyDown={handleSearchKeyDown}
                                placeholder="Buscar repositorios... (Enter para buscar)"
                                className="w-full bg-slate-950 border border-slate-700 rounded pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-nexus-neon"
                            />
                        </div>
                        <button
                            onClick={() => loadRepos(search.trim() || undefined)}
                            disabled={loading}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50"
                            title="Buscar"
                        >
                            {loading ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
                        </button>
                    </div>

                    {state.currentPath && (
                        <p className="text-[10px] text-slate-600 font-mono truncate">
                            Se clonará en: {state.currentPath}
                        </p>
                    )}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-3 space-y-4">
                    {/* Error */}
                    {error && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-900/20 border border-red-900/40 text-red-400 text-xs">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Clone success */}
                    {cloneSuccess && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-900/20 border border-green-900/40 text-green-400 text-xs">
                            <Download size={13} />
                            <span>Clonado correctamente: <strong>{cloneSuccess}</strong></span>
                        </div>
                    )}

                    {/* Favorites section */}
                    {providerFavs.length > 0 && (
                        <div>
                            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                                <Star size={10} className="text-yellow-500 fill-yellow-500" /> Favoritos
                            </p>
                            <div className="space-y-1">
                                {providerFavs.map(fav => (
                                    <RepoCard
                                        key={fav.id}
                                        repo={{
                                            id: fav.id,
                                            name: fav.name,
                                            fullName: fav.fullName,
                                            description: null,
                                            htmlUrl: fav.htmlUrl,
                                            cloneUrl: fav.cloneUrl,
                                            isPrivate: fav.private,
                                            language: null,
                                            stars: 0,
                                            provider: fav.provider,
                                        }}
                                        isFav={true}
                                        isCloning={cloningId === fav.id}
                                        onToggleFav={() => removeCloneFavorite(fav.id)}
                                        onClone={() => handleClone({
                                            id: fav.id,
                                            name: fav.name,
                                            fullName: fav.fullName,
                                            description: null,
                                            htmlUrl: fav.htmlUrl,
                                            cloneUrl: fav.cloneUrl,
                                            isPrivate: fav.private,
                                            language: null,
                                            stars: 0,
                                            provider: fav.provider,
                                        })}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Repo list */}
                    {loading && (
                        <div className="flex justify-center py-12">
                            <RefreshCw size={22} className="animate-spin text-slate-600" />
                        </div>
                    )}

                    {!loading && allRepos.length > 0 && (
                        <div>
                            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                Repositorios ({allRepos.length})
                            </p>
                            <div className="space-y-1">
                                {allRepos.map(repo => (
                                    <RepoCard
                                        key={repo.id}
                                        repo={repo}
                                        isFav={isFav(repo.id)}
                                        isCloning={cloningId === repo.id}
                                        onToggleFav={() => toggleFav(repo)}
                                        onClone={() => handleClone(repo)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {!loading && !error && allRepos.length === 0 && selectedAccount && (
                        <div className="text-center py-12 text-slate-500 text-xs">
                            <FolderGit2 size={32} className="mx-auto mb-3 text-slate-700" />
                            Busca un repositorio o presiona Enter para listar tus repos
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Repo Card ─────────────────────────────────────────────────────────────────

interface RepoCardProps {
    repo: NormalizedRepo;
    isFav: boolean;
    isCloning: boolean;
    onToggleFav: () => void;
    onClone: () => void;
}

const RepoCard: React.FC<RepoCardProps> = ({ repo, isFav, isCloning, onToggleFav, onClone }) => (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 transition-colors group">
        {/* Provider icon */}
        <div className="shrink-0">
            {repo.provider === 'github'
                ? <Github size={14} className="text-slate-400" />
                : <Gitlab size={14} className="text-orange-400" />
            }
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-slate-200 truncate">{repo.fullName}</span>
                {repo.isPrivate
                    ? <Lock size={10} className="text-slate-500 shrink-0" />
                    : <Globe size={10} className="text-slate-600 shrink-0" />
                }
                {repo.language && (
                    <span className="text-[10px] text-slate-500 bg-slate-700/60 px-1.5 py-0.5 rounded shrink-0">{repo.language}</span>
                )}
            </div>
            {repo.description && (
                <p className="text-[11px] text-slate-500 truncate mt-0.5">{repo.description}</p>
            )}
        </div>

        {/* Stars */}
        {repo.stars > 0 && (
            <div className="flex items-center gap-0.5 text-[10px] text-slate-500 shrink-0">
                <Star size={10} /> {repo.stars}
            </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
            <a
                href={repo.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-all"
                title="Abrir en navegador"
                onClick={e => e.stopPropagation()}
            >
                <ExternalLink size={12} />
            </a>
            <button
                onClick={onToggleFav}
                className={`p-1 rounded hover:bg-slate-700 transition-colors ${isFav ? 'text-yellow-400' : 'text-slate-500 hover:text-yellow-400 opacity-0 group-hover:opacity-100'}`}
                title={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
            >
                <Star size={12} className={isFav ? 'fill-yellow-400' : ''} />
            </button>
            <button
                onClick={onClone}
                disabled={isCloning}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-nexus-neon/10 hover:bg-nexus-neon/20 border border-nexus-neon/30 text-nexus-neon disabled:opacity-50 transition-colors"
                title="Clonar"
            >
                {isCloning ? <RefreshCw size={11} className="animate-spin" /> : <Download size={11} />}
                {isCloning ? 'Clonando...' : 'Clonar'}
            </button>
        </div>
    </div>
);
