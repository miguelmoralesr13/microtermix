import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

export interface BaseMockNode {
    id: string;
    parentId: string | null;
    name: string; // The folder name (e.g., 'api') or endpoint name (e.g., 'Get Users')
    createdAt: number;
}

export interface MockFolder extends BaseMockNode {
    type: 'folder';
}

export interface MockEndpoint extends BaseMockNode {
    type: 'endpoint';
    method: HttpMethod;
    route: string; // The specific route chunk, though usually derived from parent, can be customized or just use name
    statusCode: number;
    responseBody: string; // JSON string
    delayMs: number;
    headers: Record<string, string>;
}

export type MockNode = MockFolder | MockEndpoint;

export interface MockStoreState {
    nodes: Record<string, MockNode>;
    selectedNodeId: string | null;
    serverRunning: boolean;
    serverPort: number;

    // Actions
    addFolder: (parentId: string | null, name: string) => string;
    addEndpoint: (parentId: string | null, name: string, method?: HttpMethod) => string;
    updateNode: (id: string, updates: Partial<MockNode>) => void;
    deleteNode: (id: string) => void;
    setSelectedNodeId: (id: string | null) => void;
    setServerRunning: (running: boolean) => void;
    setServerPort: (port: number) => void;
}

export const useMockStore = create<MockStoreState>()(
    persist(
        (set) => ({
            nodes: {},
            selectedNodeId: null,
            serverRunning: false,
            serverPort: 3005,

            addFolder: (parentId, name) => {
                const id = crypto.randomUUID();
                const newNode: MockFolder = {
                    id,
                    type: 'folder',
                    parentId,
                    name,
                    createdAt: Date.now(),
                };
                set((state) => ({
                    nodes: { ...state.nodes, [id]: newNode },
                    selectedNodeId: id,
                }));
                return id;
            },

            addEndpoint: (parentId, name, method = 'GET') => {
                const id = crypto.randomUUID();
                const newNode: MockEndpoint = {
                    id,
                    type: 'endpoint',
                    parentId,
                    name,
                    method,
                    route: name.toLowerCase().replace(/\s+/g, '-'),
                    statusCode: 200,
                    responseBody: '{\n  "message": "success"\n}',
                    delayMs: 0,
                    headers: { 'Content-Type': 'application/json' },
                    createdAt: Date.now(),
                };
                set((state) => ({
                    nodes: { ...state.nodes, [id]: newNode },
                    selectedNodeId: id,
                }));
                return id;
            },

            updateNode: (id, updates) => {
                set((state) => {
                    const node = state.nodes[id];
                    if (!node) return state;
                    return {
                        nodes: {
                            ...state.nodes,
                            [id]: { ...node, ...updates } as MockNode,
                        },
                    };
                });
            },

            deleteNode: (id) => {
                set((state) => {
                    const newNodes = { ...state.nodes };
                    
                    // Recursively get all children to delete
                    const getChildrenIds = (parentId: string): string[] => {
                        const children = Object.values(newNodes).filter(n => n.parentId === parentId);
                        return children.reduce((acc, child) => {
                            return [...acc, child.id, ...getChildrenIds(child.id)];
                        }, [] as string[]);
                    };
                    
                    const idsToDelete = [id, ...getChildrenIds(id)];
                    idsToDelete.forEach(deleteId => {
                        delete newNodes[deleteId];
                    });

                    return {
                        nodes: newNodes,
                        selectedNodeId: state.selectedNodeId && idsToDelete.includes(state.selectedNodeId) ? null : state.selectedNodeId,
                    };
                });
            },

            setSelectedNodeId: (id) => set({ selectedNodeId: id }),
            setServerRunning: (running) => set({ serverRunning: running }),
            setServerPort: (port) => set({ serverPort: port }),
        }),
        {
            name: 'nexus-mock-store',
            partialize: (state) => ({ 
                nodes: state.nodes, 
                serverPort: state.serverPort 
                // Don't persist selectedNodeId or serverRunning state
            }),
        }
    )
);

// Helper function to build full path for an endpoint
export const getFullPath = (nodes: Record<string, MockNode>, nodeId: string): string => {
    let currentId: string | null = nodeId;
    const paths: string[] = [];
    
    while (currentId) {
        const node = nodes[currentId] as MockNode | undefined;
        if (!node) break;
        
        if (node.type === 'endpoint') {
            paths.unshift(node.route);
        } else {
            paths.unshift(node.name);
        }
        currentId = node.parentId;
    }
    
    // Clean up empty segments and join
    const cleanPaths = paths.filter(p => p.trim() !== '');
    return '/' + cleanPaths.join('/');
};
