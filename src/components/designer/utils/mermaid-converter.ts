import { Node, Edge } from '@xyflow/react';

export type DiagramMode = 'flowchart' | 'sequence';

export interface MermaidDiagramData {
    nodes: Node[];
    edges: Edge[];
    direction?: 'TD' | 'LR' | 'BT' | 'RL';
    mode: DiagramMode;
}

export class MermaidConverter {
    static convert(data: MermaidDiagramData): string {
        if (data.mode === 'sequence') {
            return this.toSequence(data);
        }
        return this.toFlowchart(data);
    }

    private static toFlowchart(data: MermaidDiagramData): string {
        const { nodes, edges, direction = 'TD' } = data;
        let mermaid = `graph ${direction}\n`;

        // 1. Separate root nodes from children (for subgraphs)
        const rootNodes = nodes.filter(n => !n.parentId);
        const childNodes = nodes.filter(n => !!n.parentId);

        // 2. Process Groups (Subgraphs)
        const groups = rootNodes.filter(n => n.type === 'group');
        const standaloneNodes = rootNodes.filter(n => n.type !== 'group');

        groups.forEach(group => {
            const label = group.data?.label || group.id;
            mermaid += `    subgraph ${group.id} ["${label}"]\n`;
            
            // Add children of this group
            const children = childNodes.filter(c => c.parentId === group.id);
            children.forEach(child => {
                mermaid += `        ${child.id}${this.getNodeShape(child)}\n`;
            });
            
            mermaid += `    end\n`;
        });

        // 3. Process standalone nodes
        standaloneNodes.forEach(node => {
            mermaid += `    ${node.id}${this.getNodeShape(node)}\n`;
        });

        // 4. Process Edges
        const nodeIds = new Set(nodes.map(n => n.id));
        edges.forEach(edge => {
            if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
            
            const label = edge.label ? `|"${edge.label}"| ` : '';
            const arrow = edge.animated ? '==>' : '-->';
            mermaid += `    ${edge.source} ${arrow}${label}${edge.target}\n`;
        });

        return mermaid;
    }

    private static getNodeShape(node: Node): string {
        const label = node.data?.label || node.id;
        const type = node.type || 'default';
        
        if (type === 'decision') return `{"${label}"}`;
        if (type === 'event') return `(("${label}"))`;
        if (type === 'database') return `[("${label}")]`;
        if (type === 'subroutine') return `[["${label}"]]`;
        if (type === 'manual') return `[\\" ${label} "/]`;
        if (type === 'input') return `[/ "${label}" /]`;
        if (type === 'terminal') return `(["${label}"])`;
        return `["${label}"]`;
    }

    private static toSequence(data: MermaidDiagramData): string {
        const { nodes, edges } = data;
        let mermaid = `sequenceDiagram\n`;

        const actors = nodes.filter(n => n.type === 'actor' || n.type === 'input' || n.type === 'default' || n.type === 'service');
        actors.sort((a, b) => a.position.x - b.position.x);

        actors.forEach(actor => {
            const label = actor.data?.label || actor.id;
            mermaid += `    participant ${actor.id} as ${label}\n`;
        });

        const sortedEdges = [...edges].sort((a, b) => {
            const nodeA_S = nodes.find(n => n.id === a.source);
            const nodeB_S = nodes.find(n => n.id === b.source);
            return (nodeA_S?.position.y || 0) - (nodeB_S?.position.y || 0);
        });

        sortedEdges.forEach(edge => {
            const label = edge.label ? `: ${edge.label}` : ': Mensaje';
            const arrow = edge.animated ? '-->>' : '->>';
            mermaid += `    ${edge.source}${arrow}${edge.target}${label}\n`;
        });

        return mermaid;
    }
}
