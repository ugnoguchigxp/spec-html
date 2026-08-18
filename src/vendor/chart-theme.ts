interface ChartRuntime {
  defaults: {
    color: string;
    borderColor: string;
    plugins?: {
      tooltip?: {
        backgroundColor: string;
        bodyColor: string;
        borderColor: string;
        borderWidth: number;
        titleColor: string;
      };
    };
  };
}

const chart = (
  globalThis as typeof globalThis & { Chart?: ChartRuntime }
).Chart;

if (chart !== undefined) {
  const documentStyle = getComputedStyle(document.documentElement);
  const themeColor = (property: string, fallback: string): string =>
    documentStyle.getPropertyValue(property).trim() || fallback;
  chart.defaults.color = themeColor("--doc-muted", "#57606a");
  chart.defaults.borderColor = themeColor("--doc-border", "#d0d7de");

  const tooltip = chart.defaults.plugins?.tooltip;
  if (tooltip !== undefined) {
    tooltip.backgroundColor = themeColor("--doc-code-background", "#24292f");
    tooltip.titleColor = themeColor("--doc-code-text", "#f6f8fa");
    tooltip.bodyColor = themeColor("--doc-code-text", "#f6f8fa");
    tooltip.borderColor = themeColor("--doc-border", "#d0d7de");
    tooltip.borderWidth = 1;
  }
}
