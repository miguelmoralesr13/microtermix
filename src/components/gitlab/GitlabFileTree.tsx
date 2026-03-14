import { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder, FileCode, RefreshCw } from 'lucide-react';
import { GitlabTreeNode, fetchGitlabRepositoryTree } from '../../services/gitlabApi';
import { cn } from '../../lib/utils';

interface GitlabFileTreeProps {
    projectPath: string;
    token: string;
    branch: string;
    apiUrl?: string;
    onFileSelect: (path: string) => void;
}

export function GitlabFileTree({ projectPath, token, branch, apiUrl, onFileSelect }: GitlabFileTreeProps) {
    const [nodes, setNodes] = useState<GitlabTreeNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        fetchGitlabRepositoryTree(projectPath, token, branch, '', apiUrl)
            .then(data => setNodes(data.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'tree' ? -1 : 1;
            })))
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [projectPath, token, branch, apiUrl]);

    if (loading) return <div className="flex justify-center p-4"><RefreshCw size={16} className="animate-spin text-slate-500" /></div>;
    if (error) return <div className="p-4 text-xs text-red-400">Error: {error}</div>;

    return (
        <div className="space-y-0.5">
            {nodes.map(node => (
                <TreeNode
                    key={node.id}
                    node={node}
                    projectPath={projectPath}
                    token={token}
                    branch={branch}
                    apiUrl={apiUrl}
                    onFileSelect={onFileSelect}
                    level={0}
                />
            ))}
        </div>
    );
}

function TreeNode({ node, projectPath, token, branch, apiUrl, onFileSelect, level }: {
    node: GitlabTreeNode;
    projectPath: string;
    token: string;
    branch: string;
    apiUrl?: string;
    onFileSelect: (path: string) => void;
    level: number;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [children, setChildren] = useState<GitlabTreeNode[]>([]);
    const [loading, setLoading] = useState(false);

    const isFolder = node.type === 'tree';

    const toggle = async () => {
        if (!isFolder) {
            onFileSelect(node.path);
            return;
        }

        const newOpen = !isOpen;
        setIsOpen(newOpen);

        if (newOpen && children.length === 0) {
            setLoading(true);
            try {
                const data = await fetchGitlabRepositoryTree(projectPath, token, branch, node.path, apiUrl);
                setChildren(data.sort((a, b) => {
                    if (a.type === b.type) return a.name.localeCompare(b.name);
                    return a.type === 'tree' ? -1 : 1;
                }));
            } catch (err) {
                console.error('Error fetching subtree:', err);
            } finally {
                setLoading(false);
            }
        }
    };

    return (
        <div className="select-none">
            <div
                className={cn(
                    "flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-slate-800 rounded transition-colors group",
                    level > 0 && "ml-3 border-l border-slate-800"
                )}
                onClick={toggle}
                style={{ paddingLeft: `${(level + 1) * 8}px` }}
            >
                {isFolder ? (
                    <>
                        {isOpen ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                        <Folder size={14} className={cn("text-microtermix-neon/70", isOpen && "text-microtermix-neon")} />
                    </>
                ) : (
                    <>
                        <div className="w-3.5 h-3.5" />
                        <FileCode size={14} className="text-slate-400 group-hover:text-microtermix-neon transition-colors" />
                    </>
                )}
                <span className={cn("text-xs text-slate-400 group-hover:text-slate-200", isFolder && isOpen && "text-slate-100 font-medium")}>
                    {node.name}
                </span>
                {loading && <RefreshCw size={10} className="animate-spin text-slate-500 ml-auto" />}
            </div>

            {isFolder && isOpen && (
                <div>
                    {children.map(child => (
                        <TreeNode
                            key={child.id}
                            node={child}
                            projectPath={projectPath}
                            token={token}
                            branch={branch}
                            apiUrl={apiUrl}
                            onFileSelect={onFileSelect}
                            level={level + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
