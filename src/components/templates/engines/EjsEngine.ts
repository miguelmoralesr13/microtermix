import { TemplateEngine } from './TemplateEngine';
import * as ejsLib from 'ejs';

export class EjsEngine implements TemplateEngine {
  readonly name = 'EJS';
  readonly mime = 'text/x-ejs';
  readonly extensions = ['.ejs', '.html'];

  async compile(template: string, data: any): Promise<string> {
    try {
      // With the 'ejs': 'ejs/ejs.min.js' alias in vite.config.ts,
      // Vite will provide either the object or a default wrapper.
      let engine: any = ejsLib;
      if (engine.default) engine = engine.default;
      
      // Fallback for cases where it's already a function (UMD)
      const render = engine.render || (typeof engine === 'function' ? engine : undefined);

      if (typeof render !== 'function') {
        throw new Error('No se pudo encontrar la función render en EJS (browser build).');
      }
      
      return render(template, data, { 
        async: false,
        cache: false,
        client: false, // In browser build this is usually ignored or works differently
        _with: true
      });
    } catch (err: any) {
      throw new Error(`[EJS] Error: ${err.message}`);
    }
  }
}
