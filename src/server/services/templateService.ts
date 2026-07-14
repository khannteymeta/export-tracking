export const TemplateService = {
  /**
   * Replaces placeholders formatted as {{key}} with values from the data object.
   */
  render(templateContent: string, data: Record<string, any>): string {
    let rendered = templateContent;
    const matches = templateContent.match(/\{\{([^}]+)\}\}/g);
    if (matches) {
      for (const match of matches) {
        // Extract the key name inside the braces
        const key = match.replace(/\{\{|\}\}/g, '').trim();

        // Retrieve nested or flat value from data
        const value = data[key] !== undefined ? String(data[key]) : '';
        rendered = rendered.replace(match, value);
      }
    }
    return rendered;
  },
};
