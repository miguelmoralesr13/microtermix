import { TemplateEngine } from './TemplateEngine';

// CRITICAL: EJS uses 'node:fs' for its fileLoader even in ESM/Browser contexts.
// We attempt to patch the Node polyfill BEFORE dynamic loading of EJS.
async function patchNodeFsPolyfill() {
  try {
    // Attempting to reach the polyfilled 'fs' via standard Node-like import
    // @ts-ignore
    const fs = await import('node:fs');
    if (fs && !fs.readFileSync) {
       console.warn('[EJS Patch] node:fs detected but incomplete. Mocking readFileSync...');
       (fs as any).readFileSync = () => { 
         throw new Error('EJS browser-mode does not support filesystem access (readFileSync).');
       };
    }
  } catch (e) {
    // If no polyfill present, EJS might fail later, but we provide window.fs as fallback
    if (typeof window !== 'undefined') {
       (window as any).fs = { 
         readFileSync: () => '',
         existsSync: () => false 
       };
    }
  }
}

export class EjsEngine implements TemplateEngine {
  readonly name = 'EJS';
  readonly mime = 'text/x-ejs';
  readonly extensions = ['.ejs', '.html'];
  private ejsInstance: any = null;

  async compile(template: string, data: any): Promise<string> {
    try {
      if (!this.ejsInstance) {
        await patchNodeFsPolyfill();
        
        // Use the standard 'ejs' entry instead of trying to reach into node_modules via custom path
        // which was causing the 'missing specifier' error.
        const mod = await import('ejs');
        this.ejsInstance = mod.default || mod;
      }
      
      return this.ejsInstance.render(template, data, { async: false });
    } catch (err: any) {
      if (err.message?.includes('readFileSync')) {
        throw new Error('[EJS Architecture Error] El motor está colisionando con el sistema de archivos del navegador. Intenta usar un motor más simple como Mustache o Liquid.');
      }
      throw new Error(`[EJS] Error: ${err.message}`);
    }
  }
}
