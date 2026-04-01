import { TemplateEngine } from './engines/TemplateEngine';
import { EjsEngine } from './engines/EjsEngine';
import { MustacheEngine } from './engines/MustacheEngine';
import { LiquidEngine } from './engines/LiquidEngine';
import { PugEngine } from './engines/PugEngine';
import { TemplateEngineType } from '../../stores/templateStore';

export class TemplateEngineFactory {
  private static engines: Map<TemplateEngineType, TemplateEngine> = new Map();

  static getEngine(type: TemplateEngineType): TemplateEngine {
    if (this.engines.has(type)) {
        return this.engines.get(type)!;
    }

    let engine: TemplateEngine;
    switch (type) {
        case 'mustache': 
            engine = new MustacheEngine(); break;
        case 'liquid': 
            engine = new LiquidEngine(); break;
        case 'ejs': 
            engine = new EjsEngine(); break;
        case 'pug': 
            engine = new PugEngine(); break;
        case 'handlebars': 
            engine = new MustacheEngine(); break; // Mustache compatible mostly
        default:
            engine = new EjsEngine(); // Fallback
    }

    this.engines.set(type, engine);
    return engine;
  }

  /**
   * Tries to detect the engine based on content or file signature
   */
  static detectEngine(content: string): TemplateEngineType | null {
    if (content.includes('<%')) return 'ejs';
    if (content.includes('{{')) {
        if (content.includes('{%')) return 'liquid';
        return 'mustache';
    }
    // Pug indentation detection
    if (/^\s*(doctype|extends|block|include|html|head|body|div|p)\b/m.test(content)) return 'pug';

    return null;
  }
}
