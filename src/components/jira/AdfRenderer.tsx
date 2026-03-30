import React, { useState, useEffect } from 'react';
import { loadConfig, getJiraMediaUrl } from './jiraApi';

export function AdfMediaFile({ id }: { id: string }) {
    const cfg = loadConfig();
    const [src, setSrc] = useState<string | null>(null);
    useEffect(() => {
        getJiraMediaUrl(`${cfg.baseUrl}/rest/api/3/attachment/content/${id}`)
            .then(setSrc).catch(() => { });
    }, [id, cfg.baseUrl]);
    if (!src) return null;
    return <img src={src} alt="" className="max-w-full rounded my-2 border border-slate-800" />;
}

export function AdfInline({ node }: { node: any }): React.ReactElement | null {
    if (node.type === 'hardBreak') return <br />;
    if (node.type === 'mention') return <span className="text-microtermix-accent font-medium">@{node.attrs?.text ?? node.attrs?.id}</span>;
    if (node.type === 'emoji') return <span>{node.attrs?.text ?? '😊'}</span>;
    if (node.type === 'inlineCard') return <a href={node.attrs?.url} target="_blank" rel="noopener noreferrer" className="text-microtermix-neon underline text-xs break-all">{node.attrs?.url}</a>;
    if (node.type === 'text') {
        const marks: any[] = node.marks ?? [];
        let el: React.ReactNode = node.text;
        if (marks.some(m => m.type === 'strong')) el = <strong>{el}</strong>;
        if (marks.some(m => m.type === 'em')) el = <em>{el}</em>;
        if (marks.some(m => m.type === 'code')) el = <code className="bg-slate-800 px-1 rounded text-[11px] font-mono">{el}</code>;
        if (marks.some(m => m.type === 'strike')) el = <s>{el}</s>;
        const link = marks.find(m => m.type === 'link');
        if (link) el = <a href={link.attrs?.href} target="_blank" rel="noopener noreferrer" className="text-microtermix-neon underline">{el}</a>;
        return <>{el}</>;
    }
    return <>{node.text ?? null}</>;
}

export function AdfNode({ node }: { node: any }): React.ReactElement | null {
    const children = (nodes: any[]) => nodes?.map((n, i) => <AdfNode key={i} node={n} />) ?? null;
    const inlines = (nodes: any[]) => nodes?.map((n, i) => <AdfInline key={i} node={n} />) ?? null;

    switch (node.type) {
        case 'paragraph':
            return <p className="mb-2 last:mb-0 leading-relaxed">{inlines(node.content ?? [])}</p>;
        case 'hardBreak':
            return <br />;
        case 'heading':
            return <p className="font-bold mb-1 text-slate-200">{inlines(node.content ?? [])}</p>;
        case 'bulletList':
            return <ul className="list-disc pl-4 mb-2 space-y-0.5">{children(node.content)}</ul>;
        case 'orderedList':
            return <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children(node.content)}</ol>;
        case 'listItem':
            return <li className="text-sm text-slate-300">{children(node.content)}</li>;
        case 'blockquote':
            return <blockquote className="border-l-2 border-slate-600 pl-3 italic text-slate-400 my-2">{children(node.content)}</blockquote>;
        case 'codeBlock':
            return <pre className="bg-slate-950 border border-slate-700 rounded p-3 text-xs text-slate-300 overflow-x-auto my-2 font-mono">{(node.content ?? []).map((n: any) => n.text ?? '').join('')}</pre>;
        case 'rule':
            return <hr className="border-slate-700 my-3" />;
        case 'mediaSingle':
        case 'mediaInline': {
            const media = node.content?.[0];
            if (!media) return null;
            if (media.attrs?.type === 'external') return <img src={media.attrs.url} alt="" className="max-w-full rounded my-2 border border-slate-800" />;
            if (media.attrs?.type === 'file' && media.attrs.id) return <AdfMediaFile id={media.attrs.id} />;
            return null;
        }
        default:
            if (node.content) return <>{children(node.content)}</>;
            if (node.text) return <AdfInline node={node} />;
            return null;
    }
}

export function AdfBody({ body }: { body: any }) {
    if (!body) return null;
    if (typeof body === 'string') return <span className="whitespace-pre-wrap text-sm text-slate-300">{body}</span>;
    if (!body.content?.length) return null;
    return <>{body.content.map((n: any, i: number) => <AdfNode key={i} node={n} />)}</>;
}
