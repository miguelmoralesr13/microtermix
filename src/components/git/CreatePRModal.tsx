import React, { useState, useRef } from 'react';
import { X, GitPullRequest, ChevronDown, ChevronRight, RefreshCw, ExternalLink, GitBranch } from 'lucide-react';

// ── Searchable branch selector ─────────────────────────────────────────────────

interface BranchSelectProps {
    value: string;
    options: string[];
    onChange: (v: string) => void;
    placeholder?: string;
}

const BranchSelect: React.FC<BranchSelectProps> = ({ value, options, onChange, placeholder }) => {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const filtered = query.trim()
        ? options.filter(b => b.toLowerCase().includes(query.toLowerCase()))
        : options;

    const select = (branch: string) => {
        onChange(branch);
        setQuery('');
        setOpen(false);
        inputRef.current?.blur();
    };

    return (
        <div className="relative">
            <div className={`flex items-center gap-1.5 bg-slate-950 border rounded-lg px-2.5 py-1.5 transition-colors ${open ? 'border-purple-500' : 'border-slate-700'}`}>
                <GitBranch size={11} className="text-slate-500 shrink-0" />
                <input
                    ref={inputRef}
                    value={open ? query : value}
                    onChange={e => setQuery(e.target.value)}
                    onFocus={() => { setOpen(true); setQuery(''); }}
                    onBlur={() => { setTimeout(() => setOpen(false), 100); }}
                    onKeyDown={e => {
                        if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
                        if (e.key === 'Enter' && filtered.length > 0) { e.preventDefault(); select(filtered[0]); }
                    }}
                    placeholder={open ? 'Buscar rama...' : placeholder}
                    className="flex-1 bg-transparent text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none min-w-0"
                />
                <ChevronDown size={11} className={`text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </div>

            {open && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto scrollbar-hide">
                    {filtered.length === 0 ? (
                        <div className="px-3 py-2 text-[11px] text-slate-600 italic">Sin resultados</div>
                    ) : (
                        filtered.map(b => (
                            <div
                                key={b}
                                onMouseDown={() => select(b)}
                                className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors ${b === value ? 'bg-purple-900/30 text-purple-300' : 'text-slate-300 hover:bg-slate-800'}`}
                            >
                                <GitBranch size={10} className="text-slate-500 shrink-0" />
                                <span className="truncate">{b}</span>
                                {b === value && <span className="ml-auto text-[9px] text-purple-400">activa</span>}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};
import { createGithubPR } from '../../services/githubApi';
import { createGitlabMR } from '../../services/gitlabApi';
import type { GitAccount } from '../../stores/gitStore';
import { NormalizedPR, normalizeGithubPR, normalizeGitlabMR } from './PRSection';

interface CreatePRModalProps {
    projectPath: string;
    account: GitAccount;
    activeBranch: string;
    branches: string[];
    onClose: () => void;
    onCreated: (pr: NormalizedPR) => void;
}

export const CreatePRModal: React.FC<CreatePRModalProps> = ({
    projectPath, account, activeBranch, branches, onClose, onCreated,
}) => {
    const isGitlab = account.provider === 'gitlab';
    const label = isGitlab ? 'Merge Request' : 'Pull Request';

    const [title, setTitle] = useState('');
    const [isUserEditing, setIsUserEditing] = useState(false);
    const [head, setHead] = useState(activeBranch);
    const [base, setBase] = useState(() => {
        const preferred = ['main', 'master', 'develop', 'dev'];
        return preferred.find(b => branches.includes(b) && b !== activeBranch)
            ?? branches.find(b => b !== activeBranch)
            ?? '';
    });

    // Update title automatically if user hasn't edited it manually
    React.useEffect(() => {
        if (!isUserEditing) {
            setTitle(`${head} into ${base}`);
        }
    }, [head, base, isUserEditing]);
    const [description, setDescription] = useState('');
    const [draft, setDraft] = useState(false);
    const [reviewers, setReviewers] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [createdUrl, setCreatedUrl] = useState<string | null>(null);

    const allBranches = [...new Set([...branches, activeBranch])].sort();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) { setError('El título es requerido.'); return; }
        if (!head) { setError('Selecciona la rama origen.'); return; }
        if (!base) { setError('Selecciona la rama destino.'); return; }
        if (head === base) { setError('La rama origen y destino deben ser diferentes.'); return; }

        setLoading(true);
        setError(null);
        try {
            let url: string;
            let normalized: NormalizedPR;
            if (isGitlab) {
                const mr = await createGitlabMR(
                    projectPath, account.token, title.trim(),
                    head, base, description, draft, account.url || undefined,
                );
                url = mr.web_url;
                normalized = normalizeGitlabMR(mr);
            } else {
                const reviewerList = reviewers.split(',').map(r => r.trim()).filter(Boolean);
                const pr = await createGithubPR(
                    projectPath, account.token, title.trim(),
                    head, base, description, draft, reviewerList, account.url || undefined,
                );
                url = pr.html_url;
                normalized = normalizeGithubPR(pr);
            }
            onCreated(normalized);
            setCreatedUrl(url);
        } catch (e: any) {
            setError(e.message || 'Error al crear el PR');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-700 w-[520px] max-h-[85vh] rounded-xl shadow-2xl flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-2">
                        <GitPullRequest size={15} className="text-purple-400" />
                        <h2 className="text-sm font-bold text-white">Nuevo {label}</h2>
                        <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                            {account.alias} · {isGitlab ? 'GitLab' : 'GitHub'}
                        </span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* Success state */}
                {createdUrl ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
                        <div className="w-12 h-12 rounded-full bg-green-900/30 border border-green-700/40 flex items-center justify-center">
                            <GitPullRequest size={22} className="text-green-400" />
                        </div>
                        <div>
                            <p className="text-white font-semibold mb-1">{label} creado</p>
                            <p className="text-slate-400 text-xs">{title}</p>
                        </div>
                        <a
                            href={createdUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-900/30 border border-purple-700/40 text-purple-300 text-sm hover:bg-purple-900/50 transition-colors"
                        >
                            <ExternalLink size={13} /> Abrir en navegador
                        </a>
                        <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                            Cerrar
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 space-y-4">
                        {/* Required: Title */}
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-400">Título <span className="text-red-400">*</span></label>
                            <input
                                autoFocus
                                value={title}
                                onChange={e => { setTitle(e.target.value); setIsUserEditing(true); }}
                                placeholder={`Título del ${label}...`}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-500 transition-colors"
                            />
                        </div>

                        {/* Required: Branches */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-400">Rama origen <span className="text-red-400">*</span></label>
                                <BranchSelect
                                    value={head}
                                    options={allBranches}
                                    onChange={newHead => {
                                        setHead(newHead);
                                        if (newHead === base) {
                                            const fallback = allBranches.find(b => b !== newHead) ?? '';
                                            setBase(fallback);
                                        }
                                    }}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-400">Rama destino <span className="text-red-400">*</span></label>
                                <BranchSelect
                                    value={base}
                                    options={allBranches.filter(b => b !== head)}
                                    onChange={setBase}
                                />
                            </div>
                        </div>

                        {/* Advanced toggle */}
                        <button
                            type="button"
                            onClick={() => setShowAdvanced(v => !v)}
                            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                        >
                            {showAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            Opciones avanzadas
                        </button>

                        {/* Advanced fields */}
                        {showAdvanced && (
                            <div className="space-y-3 pl-3 border-l border-slate-800">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-400">Descripción</label>
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        rows={4}
                                        placeholder="Describe los cambios..."
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-500 transition-colors resize-none"
                                    />
                                </div>

                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={draft}
                                        onChange={e => setDraft(e.target.checked)}
                                        className="rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-slate-900"
                                    />
                                    <span className="text-xs text-slate-400">
                                        Crear como borrador (Draft)
                                        {isGitlab && <span className="text-slate-600 ml-1">— añade "Draft:" al título</span>}
                                    </span>
                                </label>

                                {!isGitlab && (
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-slate-400">Reviewers</label>
                                        <input
                                            value={reviewers}
                                            onChange={e => setReviewers(e.target.value)}
                                            placeholder="usuario1, usuario2 (separados por coma)"
                                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-500 transition-colors"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">
                                {error}
                            </p>
                        )}

                        {/* Footer */}
                        <div className="flex justify-end gap-2 pt-2 pb-1">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading || !title.trim()}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-50 transition-colors"
                            >
                                {loading && <RefreshCw size={11} className="animate-spin" />}
                                Crear {label}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};
