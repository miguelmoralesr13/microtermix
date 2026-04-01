export interface TemplateEngine {
  readonly name: string;
  readonly mime: string;
  readonly extensions: string[];

  /**
   * Compiles and renders the given template with the provided data.
   * @param template - The source template string.
   * @param data - JSON object providing context for compilation.
   * @returns compiled HTML result or throws if error occurs.
   */
  compile(template: string, data: any): Promise<string>;
}
