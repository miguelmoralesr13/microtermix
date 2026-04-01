import { Liquid } from 'liquidjs';
import { TemplateEngine } from './TemplateEngine';

export class LiquidEngine implements TemplateEngine {
  readonly name = 'Liquid';
  readonly mime = 'text/x-liquid';
  readonly extensions = ['.liquid', '.html'];
  private engine: Liquid;

  constructor() {
    this.engine = new Liquid();
  }

  async compile(template: string, data: any): Promise<string> {
    try {
      return await this.engine.parseAndRender(template, data);
    } catch (err: any) {
      throw new Error(`[Liquid] Error: ${err.message}`);
    }
  }
}
