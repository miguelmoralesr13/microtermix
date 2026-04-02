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

  /**
   * Returns a sample boilerplate for the given engine
   */
  static getSeed(type: TemplateEngineType): { template: string; data: string; css: string } {
    const baseData = JSON.stringify({
        title: "Microtermix Premium",
        user: { name: "Developer", role: "Architect" },
        features: ["Ultra-fast compiler", "Monaco powered editors", "Dynamic UI updates", "Multi-engine support"],
        active: true
    }, null, 4);

    const baseCss = `h1 { \n  color: #2DD4BF; \n  font-family: 'Inter', sans-serif; \n  font-weight: 800; \n  letter-spacing: -0.025em; \n  text-transform: uppercase;\n}\n\nul {\n  list-style-type: none;\n  padding: 0;\n}\n\nli {\n  color: #94A3B8;\n  margin-bottom: 0.5rem;\n  padding-left: 1.5rem;\n  position: relative;\n}\n\nli::before {\n  content: "→";\n  position: absolute;\n  left: 0;\n  color: #2DD4BF;\n}`;

    switch (type) {
        case 'pug':
            return {
                template: `h1 #{title}\np Welcome back, #{user.name} (#{user.role})\n\nif active\n  ul\n    each feature in features\n      li= feature\nelse\n  p Template system is currently inactive.`,
                data: baseData,
                css: baseCss
            };
        case 'mustache':
        case 'handlebars':
            return {
                template: `<h1>{{title}}</h1>\n<p>Welcome back, {{user.name}} ({{user.role}})</p>\n\n{{#active}}\n  <ul>\n    {{#features}}\n      <li>{{.}}</li>\n    {{/features}}\n  </ul>\n{{/active}}\n{{^active}}\n  <p>Template system is currently inactive.</p>\n{{/active}}`,
                data: baseData,
                css: baseCss
            };
        case 'liquid':
            return {
                template: `<h1>{{title}}</h1>\n<p>Welcome back, {{user.name}} ({{user.role}})</p>\n\n{% if active %}\n  <ul>\n    {% for feature in features %}\n      <li>{{feature}}</li>\n    {% endfor %}\n  </ul>\n{% else %}\n  <p>Template system is currently inactive.</p>\n{% endif %}`,
                data: baseData,
                css: baseCss
            };
        default: // EJS
            return {
                template: `<h1><%= title %></h1>\n<p>Welcome back, <%= user.name %> (<%= user.role %>)</p>\n\n<% if (active) { %>\n  <ul>\n    <% features.forEach(function(feature) { %>\n      <li><%= feature %></li>\n    <% }); %>\n  </ul>\n<% } else { %>\n  <p>Template system is currently inactive.</p>\n<% } %>`,
                data: baseData,
                css: baseCss
            };
    }
  }
}
