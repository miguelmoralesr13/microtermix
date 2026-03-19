import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SwaggerStore {
    text: string;
    preview: boolean;
    editorPx: number | null;
    
    // Actions
    setText: (text: string) => void;
    setPreview: (preview: boolean) => void;
    setEditorPx: (px: number | null) => void;
}

const DEFAULT_PLACEHOLDER = `openapi: "3.0.3"
info:
  title: Mi API
  version: "1.0.0"
paths:
  /ping:
    get:
      summary: Ping
      responses:
        "200":
          description: OK
`;

export const useSwaggerStore = create<SwaggerStore>()(
    persist(
        (set) => ({
            text: DEFAULT_PLACEHOLDER,
            preview: true,
            editorPx: null,

            setText: (text) => set({ text }),
            setPreview: (preview) => set({ preview }),
            setEditorPx: (editorPx) => set({ editorPx }),
        }),
        {
            name: 'microtermix-swagger-storage',
        }
    )
);
