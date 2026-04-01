import Mustache from 'mustache';
import { TemplateEngine } from './TemplateEngine';

export class MustacheEngine implements TemplateEngine {
  readonly name = 'Mustache';
  readonly mime = 'text/x-mustache-template';
  readonly extensions = ['.mustache', '.html'];

  async compile(template: string, data: any): Promise<string> {
    try {
      return Mustache.render(template, data);
    } catch (err: any) {
      throw new Error(`[Mustache] Error: ${err.message}`);
    }
  }
}
