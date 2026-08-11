const MERMAID_THEME_LIGHT = {
  primaryColor: "#4A90D9",
  primaryTextColor: "#333",
  primaryBorderColor: "#2B5F8E",
  lineColor: "#5A5A5A",
  secondaryColor: "#E8F4FD",
  tertiaryColor: "#F5F5F5",
  background: "#FFFFFF",
  mainBkg: "#FFFFFF",
  nodeBorder: "#4A90D9",
  clusterBkg: "#F0F4F8",
  clusterBorder: "#4A90D9",
  titleColor: "#333",
  edgeLabelBackground: "#FFFFFF",
  actorBkg: "#E8F4FD",
  actorBorder: "#4A90D9",
  actorTextColor: "#333",
  actorLineColor: "#5A5A5A",
  signalColor: "#4A90D9",
  signalTextColor: "#333",
  labelBoxBkg: "#E8F4FD",
  labelBoxBorderColor: "#4A90D9",
  labelTextColor: "#333",
  loopTextColor: "#333",
  noteBorderColor: "#4A90D9",
  noteBkgColor: "#FFF9E6",
  noteTextColor: "#333",
  activationBorderColor: "#4A90D9",
  activationBkgColor: "#E8F4FD",
  sequenceNumberColor: "#FFFFFF",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
};
const MERMAID_THEME_DARK = {
  primaryColor: "#4A90D9",
  primaryTextColor: "#d4d4d4",
  primaryBorderColor: "#5B9FE0",
  lineColor: "#9aa0a6",
  secondaryColor: "#1e3a5f",
  tertiaryColor: "#2d2d30",
  background: "#1e1e1e",
  mainBkg: "#1e1e1e",
  nodeBorder: "#4A90D9",
  clusterBkg: "#252526",
  clusterBorder: "#4A90D9",
  titleColor: "#d4d4d4",
  edgeLabelBackground: "#1e1e1e",
  actorBkg: "#1e3a5f",
  actorBorder: "#4A90D9",
  actorTextColor: "#d4d4d4",
  actorLineColor: "#9aa0a6",
  signalColor: "#4A90D9",
  signalTextColor: "#d4d4d4",
  labelBoxBkg: "#1e3a5f",
  labelBoxBorderColor: "#4A90D9",
  labelTextColor: "#d4d4d4",
  loopTextColor: "#d4d4d4",
  noteBorderColor: "#4A90D9",
  noteBkgColor: "#3d3520",
  noteTextColor: "#d4d4d4",
  activationBorderColor: "#4A90D9",
  activationBkgColor: "#1e3a5f",
  sequenceNumberColor: "#FFFFFF",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
};
function buildMermaidConfig(isDarkMode) {
  return {
    startOnLoad: false,
    securityLevel: "loose",
    // Allow click events in diagrams
    theme: "base",
    // Use base theme for customization
    themeVariables: isDarkMode ? MERMAID_THEME_DARK : MERMAID_THEME_LIGHT,
    flowchart: {
      useMaxWidth: false,
      // Generate fixed-size SVG for proper scaling
      htmlLabels: true,
      curve: "basis",
      // Smooth curved lines
      padding: 15,
      nodeSpacing: 50,
      rankSpacing: 50,
      diagramPadding: 8
    },
    sequence: {
      useMaxWidth: false,
      // Generate fixed-size SVG for proper scaling
      diagramMarginX: 8,
      diagramMarginY: 8,
      actorMargin: 50,
      width: 150,
      height: 65,
      boxMargin: 10,
      boxTextMargin: 5,
      noteMargin: 10,
      messageMargin: 35,
      mirrorActors: false,
      bottomMarginAdj: 1
    },
    gantt: {
      useMaxWidth: false,
      leftPadding: 75,
      gridLineStartPadding: 35,
      barHeight: 20,
      barGap: 4,
      topPadding: 50,
      titleTopMargin: 25
    },
    class: {
      useMaxWidth: false
    },
    state: {
      useMaxWidth: false
    },
    pie: {
      useMaxWidth: false
    }
  };
}
export {
  MERMAID_THEME_DARK,
  MERMAID_THEME_LIGHT,
  buildMermaidConfig
};
