import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TemplateEngineType = 'pug' | 'ejs' | 'mustache' | 'liquid' | 'handlebars';

interface TemplateState {
  template: string;
  data: string; // JSON string
  css: string; // CSS custom styles
  engine: TemplateEngineType;
  autoDetect: boolean;
  output: string;
  error: string | null;
}

interface TemplateActions {
  setTemplate: (val: string | undefined) => void;
  setData: (val: string | undefined) => void;
  setCss: (css: string | undefined) => void;
  setEngine: (engine: TemplateEngineType) => void;
  setAutoDetect: (val: boolean) => void;
  setOutput: (val: string) => void;
  setError: (val: string | null) => void;
  reset: () => void;
}

export const useTemplateStore = create<TemplateState & TemplateActions>()(
  persist(
    (set) => ({
      template: '',
      data: '{}',
      css: '',
      engine: 'ejs',
      autoDetect: true,
      output: '',
      error: null,

      setTemplate: (template) => set({ template: template ?? '' }),
      setData: (data) => set({ data: data ?? '{}' }),
      setCss: (css) => set({ css: css ?? '' }),
      setEngine: (engine) => set({ engine }),
      setAutoDetect: (autoDetect) => set({ autoDetect }),
      setOutput: (output) => set({ output, error: null }),
      setError: (error) => set({ error }),
      reset: () => set({ template: '', data: '{}', css: '', output: '', error: null }),
    }),
    {
      name: 'microtermix-template-store',
    }
  )
);
