import { TemplateEngine } from './TemplateEngine';

export class PugEngine implements TemplateEngine {
  readonly name = 'Pug';
  readonly mime = 'text/x-pug';
  readonly extensions = ['.pug', '.jade'];
  private pug: any = null;

  async compile(template: string, data: any): Promise<string> {
    try {
      if (!this.pug) {
        // Dynamic import to avoid breaking if standard 'pug' doesn't work in browser
        try {
          this.pug = await import('pug');
        } catch (e) {
          console.warn('Pug standard package failed to load in browser. Fallback to warning.');
          throw new Error('Pug requires Node.js environment or a pre-compiled browser version. Currently in development for browser-only mode.');
        }
      }
      
      // Note: pug.render might try to use 'fs'. 
      // In browser, use pug.compileClient or similar if available.
      if (this.pug && typeof this.pug.render === 'function') {
          return this.pug.render(template, data);
      }
      
      throw new Error('Pug renderer not available in this environment.');
    } catch (err: any) {
      throw new Error(`[Pug] Error: ${err.message}`);
    }
  }
}
