import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Github, Gitlab, Star, Download, Search, Lock, Globe, RefreshCw, AlertTriangle, AlertCircle, FolderGit2, ExternalLink } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useGitStore, type CloneFavorite } from '../../stores/gitStore';
import { useWorkspace } from '../../context/WorkspaceContext';
import { fetchUserGithubRepos, searchGithubRepos, fetchUserOrganizations, fetchOrgRepos, type GithubRepo, type GithubOrg } from '../../services/githubApi';
import { fetchUserGitlabProjects, searchGitlabProjects, type GitlabProject } from '../../services/gitlabApi';
import { cn } from '../../lib/utils';

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
    visibility?: string;
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
        visibility: r.visibility,
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
    
    // Debug accounts list
    useEffect(() => {
        console.log('[GITHUB_DEBUG] Accounts in store:', accounts.map(a => ({ id: a.id, alias: a.alias, provider: a.provider })));
    }, [accounts]);

    const [search, setSearch] = useState('');
    const [repos, setRepos] = useState<NormalizedRepo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [cloningId, setCloningId] = useState<string | null>(null);
    const [clonedIds, setClonedIds] = useState<Set<string>>(new Set());
    const [cloneTargetName, setCloneTargetName] = useState<string>('');
    const [manualRepoStr, setManualRepoStr] = useState<string>('');
    const [orgs, setOrgs] = useState<GithubOrg[]>([]);
    const [selectedOrg, setSelectedOrg] = useState<string>(''); // '' means personal repos
    const searchRef = useRef<HTMLInputElement>(null);

    const selectedAccount = accounts.find(a => a.id === selectedAccountId);

    const loadRepos = useCallback(async (query?: string) => {
        if (!selectedAccount) return;
        setLoading(true);
        setError(null);
        setRepos([]);
        try {
            if (selectedAccount.provider === 'github') {
                let data: GithubRepo[] = [];
                if (query) {
                    data = await searchGithubRepos(selectedAccount.url, selectedAccount.token, query);
                } else if (selectedOrg) {
                    data = await fetchOrgRepos(selectedAccount.url, selectedAccount.token, selectedOrg);
                } else {
                    data = await fetchUserGithubRepos(selectedAccount.url, selectedAccount.token);
                }
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
            // Si cargamos 0 repos pero el perfil funciona, es casi seguro un tema de permisos
            if (repos.length === 0 && !error && !query && !selectedOrg) {
                // El log ya nos dirá los scopes
            }
        }
    }, [selectedAccount, selectedOrg]);

    const loadOrgs = useCallback(async () => {
        if (!selectedAccount || selectedAccount.provider !== 'github') {
            setOrgs([]);
            return;
        }
        try {
            const data = await fetchUserOrganizations(selectedAccount.url, selectedAccount.token);
            console.log(`[GITHUB_DEBUG] Organizations found: ${data.length}`, data.map(o => o.login));
            setOrgs(data);
        } catch (e) {
            console.error('[GITHUB_DEBUG] Error fetching orgs', e);
        }
    }, [selectedAccount]);

    useEffect(() => {
        setSearch('');
        setRepos([]);
        setError(null);
        setSelectedOrg('');
        if (selectedAccount) {
            loadRepos();
            loadOrgs();
        }
    }, [selectedAccountId]);

    useEffect(() => {
        if (selectedAccount && !search) {
            loadRepos();
        }
    }, [selectedOrg]);

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const q = search.trim();
            console.log('[GITHUB_DEBUG] Triggering search for:', q);
            // If we have a query, we perform a search. Otherwise we reload the default list.
            loadRepos(q || undefined);
        }
    };

    const buildAuthenticatedUrl = (cloneUrl: string, account: typeof selectedAccount): string => {
        if (!account?.token) return cloneUrl;
        try {
            const parsed = new URL(cloneUrl);
            if (account.provider === 'github') {
                parsed.username = account.token;
            } else {
                // GitLab uses oauth2 as username with token as password
                parsed.username = 'oauth2';
                parsed.password = account.token;
            }
            return parsed.toString();
        } catch {
            return cloneUrl;
        }
    };

    const handleClone = async (repo: Partial<NormalizedRepo> & { cloneUrl: string, id: string, name: string }, targetName?: string) => {
        if (!state.currentPath) return;
        setCloningId(repo.id);
        setError(null);
        const folderName = (targetName || repo.name).trim();
        try {
            const authUrl = buildAuthenticatedUrl(repo.cloneUrl, selectedAccount);
            const args = ['clone', authUrl];
            if (folderName && folderName !== repo.name) args.push(folderName);
            const res: any = await invoke('git_execute', {
                projectPath: state.currentPath,
                args,
            });
            if (!res.success) {
                const msg: string = res.stderr || res.stdout || '';
                if (msg.toLowerCase().includes('already exists')) {
                    throw new Error(`El directorio "${folderName}" ya existe. Cambia el nombre de destino.`);
                }
                throw new Error(msg || 'Clone failed');
            }
            setClonedIds(prev => new Set(prev).add(repo.id));
            setCloneTargetName('');
            setManualRepoStr('');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setCloningId(null);
        }
    };

    const handleManualClone = async () => {
        const val = manualRepoStr.trim();
        if (!val) return;

        let cloneUrl = val;
        let name = val.split('/').pop()?.replace('.git', '') || 'repo';
        let id = val;

        // If it looks like owner/repo, complete the URL for GitHub
        if (!val.startsWith('http') && !val.startsWith('git@')) {
            if (selectedAccount?.provider === 'github') {
                cloneUrl = `https://github.com/${val}.git`;
                id = val;
                name = val.split('/').pop() || val;
            }
        }

        handleClone({ id, name, cloneUrl }, cloneTargetName);
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
                        <Download size={16} className="text-microtermix-neon" />
                        <h2 className="text-base font-bold text-white">Clonar Repositorio</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Account selector + Search */}
                <div className="px-5 py-3 border-b border-slate-800 shrink-0 space-y-2">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-slate-500 shrink-0 w-12">Cuenta:</label>
                            <select
                                value={selectedAccountId}
                                onChange={e => setSelectedAccountId(e.target.value)}
                                className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-microtermix-neon"
                            >
                                {accounts.map(a => (
                                    <option key={a.id} value={a.id}>
                                        [{a.provider === 'github' ? 'GitHub' : 'GitLab'}] {a.alias} ({a.url.replace('https://', '')})
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

                        {selectedAccount?.provider === 'github' && orgs.length > 0 && (
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-slate-500 shrink-0 w-12">Filtrar por:</label>
                                <select
                                    value={selectedOrg}
                                    onChange={e => setSelectedOrg(e.target.value)}
                                    className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-microtermix-neon"
                                >
                                    <option value="">[Todo] Mis Repos y Colaboraciones</option>
                                    {orgs.map(org => (
                                        <option key={org.login} value={org.login}>
                                            [Org] {org.login}
                                        </option>
                                    ))}
                                </select>
                                <button 
                                    onClick={() => loadRepos()}
                                    className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
                                    title="Refrescar lista"
                                >
                                    <RefreshCw size={12} className={cn(loading && "animate-spin")} />
                                </button>
                            </div>
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
                                className="w-full bg-slate-950 border border-slate-700 rounded pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-microtermix-neon"
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

                    <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-500 shrink-0">Path/URL:</label>
                        <div className="relative flex-1">
                            <input
                                type="text"
                                value={manualRepoStr}
                                onChange={e => setManualRepoStr(e.target.value)}
                                placeholder="usuario/repo o URL .git completa"
                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-microtermix-neon"
                            />
                        </div>
                        <button
                            onClick={handleManualClone}
                            disabled={!manualRepoStr.trim() || !!cloningId}
                            className="px-3 py-1.5 rounded bg-microtermix-neon/10 hover:bg-microtermix-neon/20 border border-microtermix-neon/30 text-microtermix-neon text-xs font-bold transition-colors disabled:opacity-50"
                        >
                            {cloningId === manualRepoStr ? <RefreshCw size={12} className="animate-spin" /> : 'Clonar Directo'}
                        </button>
                    </div>

                    {state.currentPath && (
                        <p className="text-[10px] text-slate-600 font-mono" title={state.currentPath}>
                            <span className="text-slate-700">en: </span>
                            <span className="text-slate-500">…/{state.currentPath.replace(/\\/g, '/').split('/').slice(-2).join('/')}</span>
                        </p>
                    )}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-3 space-y-4">
                    {/* Error */}
                    {error && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-900/20 border border-red-900/40 text-red-400 text-xs">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="font-bold mb-1">Error de Conexión</p>
                                <p>{error}</p>
                            </div>
                        </div>
                    )}

                    {!loading && !error && repos.length === 0 && !search && (
                        <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-900/20 border border-amber-900/40 text-amber-200 text-xs">
                            <AlertCircle size={18} className="text-amber-500 shrink-0" />
                            <div className="space-y-2">
                                <p className="font-bold text-amber-400 flex items-center gap-1.5">
                                    No se encontraron repositorios
                                </p>
                                <p className="text-slate-300 leading-relaxed">
                                    Tu token está conectado correctamente, pero **GitHub no devuelve ningún repositorio**. Esto suele pasar por:
                                </p>
                                <ul className="list-disc pl-4 space-y-1 text-slate-400">
                                    <li>Falta el permiso <code className="text-amber-500">repo</code> en el Token.</li>
                                    <li>Falta el permiso <code className="text-amber-500">read:org</code> para ver repositorios de empresa.</li>
                                    <li>El Token necesita ser **Autorizado vía SSO** por tu organización.</li>
                                </ul>
                                <div className="pt-1">
                                    <a 
                                        href="https://github.com/settings/tokens" 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="text-microtermix-neon hover:underline font-bold"
                                    >
                                        Ir a GitHub para revisar permisos →
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Clone successes */}
                    {clonedIds.size > 0 && (
                        <div className="p-3 rounded-lg bg-green-900/20 border border-green-900/40 text-green-400 text-xs space-y-1">
                            {[...clonedIds].map(id => (
                                <div key={id} className="flex items-center gap-2">
                                    <Download size={11} className="shrink-0" />
                                    <span className="truncate">{id}</span>
                                </div>
                            ))}
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
                                        isCloned={clonedIds.has(fav.id)}
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
                                        }, cloneTargetName)}
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
                                        isCloned={clonedIds.has(repo.id)}
                                        onToggleFav={() => toggleFav(repo)}
                                        onClone={() => handleClone(repo, cloneTargetName)}
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
    isCloned: boolean;
    onToggleFav: () => void;
    onClone: () => void;
}

const RepoCard: React.FC<RepoCardProps> = ({ repo, isFav, isCloning, isCloned, onToggleFav, onClone }) => {
    // Split owner/repo for better display
    const parts = repo.fullName.split('/');
    const repoName = parts.pop() ?? repo.fullName;
    const orgName = parts.join('/');

    return (
        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors group ${isCloned ? 'bg-green-900/10 border-green-800/40' : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'}`}>
            {/* Provider icon */}
            <div className="shrink-0">
                {repo.provider === 'github'
                    ? <Github size={14} className="text-slate-400" />
                    : <Gitlab size={14} className="text-orange-400" />
                }
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-slate-200 text-xs shrink-0 truncate max-w-[200px]">{repoName}</span>
                    {orgName && <span className="text-[10px] text-slate-500 truncate shrink min-w-0">{orgName}/</span>}
                    
                    {repo.isPrivate ? (
                        <div className="flex items-center gap-1">
                            <Lock size={10} className="text-amber-500 shrink-0" />
                            <span className="text-[9px] font-bold text-amber-600/80 uppercase tracking-tighter">Private</span>
                        </div>
                    ) : repo.visibility === 'internal' ? (
                        <div className="flex items-center gap-1">
                            <Lock size={10} className="text-blue-400 shrink-0" />
                            <span className="text-[9px] font-bold text-blue-500/80 uppercase tracking-tighter">Internal</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1">
                            <Globe size={10} className="text-slate-600 shrink-0" />
                            <span className="text-[9px] font-bold text-slate-500/80 uppercase tracking-tighter">Public</span>
                        </div>
                    )}

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
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors disabled:opacity-50 ${isCloned ? 'bg-green-900/20 border-green-700/40 text-green-400 hover:bg-green-900/30' : 'bg-microtermix-neon/10 hover:bg-microtermix-neon/20 border-microtermix-neon/30 text-microtermix-neon'}`}
                    title={isCloned ? 'Clonar de nuevo' : 'Clonar'}
                >
                    {isCloning ? <RefreshCw size={11} className="animate-spin" /> : <Download size={11} />}
                    {isCloning ? 'Clonando...' : isCloned ? '✓ Clonado' : 'Clonar'}
                </button>
            </div>
        </div>
    );
};
