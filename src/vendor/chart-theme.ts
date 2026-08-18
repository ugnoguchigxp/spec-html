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
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  chart.defaults.color = dark ? "#e6edf3" : "#57606a";
  chart.defaults.borderColor = dark ? "#30363d" : "#d0d7de";

  const tooltip = chart.defaults.plugins?.tooltip;
  if (tooltip !== undefined) {
    tooltip.backgroundColor = dark ? "#161b22" : "#24292f";
    tooltip.titleColor = "#f6f8fa";
    tooltip.bodyColor = "#f6f8fa";
    tooltip.borderColor = dark ? "#30363d" : "#57606a";
    tooltip.borderWidth = 1;
  }
}
