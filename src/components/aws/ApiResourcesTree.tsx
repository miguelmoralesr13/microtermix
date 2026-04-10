import React, { useMemo } from 'react';
import { useApiGatewayStore, RestApiResource, HttpApiRoute } from '../../stores/apiGatewayStore';
import { Loader2 } from 'lucide-react';
import { ApiTreeItem } from './ApiTreeItem';
import { useApiResources } from '../../hooks/queries/useApiGatewayQueries';

export interface ApiTreeNode {
    segment: string;
    fullPath: string;
    methods: string[];
    children: Record<string, ApiTreeNode>;
    resourceId?: string;
    target?: string | null;
}

const buildRestTree = (resources: RestApiResource[]): ApiTreeNode => {
    const root: ApiTreeNode = { segment: '/', fullPath: '/', methods: [], children: {} };
    resources.forEach(res => {
        if (res.path === '/') {
            root.resourceId = res.id;
            root.methods = res.methods;
            return;
        }
        const segments = res.path.split('/').filter(Boolean);
        let current = root;
        let currentPath = '';
        segments.forEach((seg, i) => {
            currentPath += '/' + seg;
            if (!current.children[seg]) {
                current.children[seg] = { segment: seg, fullPath: currentPath, methods: [], children: {} };
            }
            current = current.children[seg];
            if (i === segments.length - 1) {
                current.resourceId = res.id;
                current.methods = res.methods;
            }
        });
    });
    return root;
};

const buildHttpTree = (routes: HttpApiRoute[]): ApiTreeNode => {
    const root: ApiTreeNode = { segment: '/', fullPath: '/', methods: [], children: {} };
    routes.forEach(route => {
        let method = "ANY";
        let pathStr = route.route_key;

        if (route.route_key.includes(' ')) {
            const parts = route.route_key.split(' ');
            method = parts[0];
            pathStr = parts.slice(1).join(' ');
        } else if (route.route_key === '$default') {
            method = "ANY";
            pathStr = "$default";
        }

        if (pathStr === '/' || pathStr === '$default') {
            if (pathStr === '$default') {
                if (!root.children['$default']) {
                    root.children['$default'] = { segment: '$default', fullPath: '$default', methods: [], children: {} };
                }
                root.children['$default'].methods.push(method);
                root.children['$default'].resourceId = route.route_id;
                root.children['$default'].target = route.target;
            } else {
                root.methods.push(method);
                root.resourceId = route.route_id;
                root.target = route.target;
            }
            return;
        }

        const segments = pathStr.split('/').filter(Boolean);
        let current = root;
        let currentPath = '';
        segments.forEach((seg, i) => {
            currentPath += '/' + seg;
            if (!current.children[seg]) {
                current.children[seg] = { segment: seg, fullPath: currentPath, methods: [], children: {} };
            }
            current = current.children[seg];
            if (i === segments.length - 1) {
                if (!current.methods.includes(method)) {
                    current.methods.push(method);
                }
                current.resourceId = route.route_id;
                current.target = route.target;
            }
        });
    });
    return root;
};

interface ApiResourcesTreeProps {
    simple?: boolean;
}

export const ApiResourcesTree: React.FC<ApiResourcesTreeProps> = ({ simple = false }) => {
    const { selectedApi } = useApiGatewayStore();
    const { data: resources, isLoading } = useApiResources(selectedApi?.id, selectedApi?.type);

    const tree = useMemo(() => {
        if (!selectedApi || !resources) return null;
        if (selectedApi.type === 'rest') {
            return buildRestTree(resources as RestApiResource[]);
        } else {
            return buildHttpTree(resources as HttpApiRoute[]);
        }
    }, [selectedApi, resources]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-slate-500 gap-4">
                <Loader2 className="animate-spin" size={24} />
                <p className="text-[10px] uppercase font-bold tracking-widest">Cargando árbol...</p>
            </div>
        );
    }

    if (!tree) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-slate-600 gap-2 text-center">
                <p className="text-xs font-medium">No se encontraron rutas para esta API</p>
            </div>
        );
    }

    return (
        <div className="p-4 bg-slate-900/10 h-full overflow-y-auto custom-scrollbar">
            <ApiTreeItem node={tree} simple={simple} />
        </div>
    );
};
