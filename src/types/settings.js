const DEFAULT_ACTIVITY_BAR_ITEMS = [
  { id: "documents", visible: true },
  { id: "terminal", visible: true },
  { id: "agent", visible: true },
  { id: "browser", visible: true },
  { id: "settings", visible: true }
];
function normalizeActivityBarItems(items) {
  const knownIds = new Set(DEFAULT_ACTIVITY_BAR_ITEMS.map((d) => d.id));
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || !knownIds.has(item.id) || typeof item.visible !== "boolean")
      continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push({ id: item.id, visible: item.visible });
  }
  for (const def of DEFAULT_ACTIVITY_BAR_ITEMS) {
    if (!seen.has(def.id)) result.push({ ...def });
  }
  const settings = result.find((i) => i.id === "settings");
  return [
    ...result.filter((i) => i.id !== "settings"),
    { ...settings, visible: true }
  ];
}
export {
  DEFAULT_ACTIVITY_BAR_ITEMS,
  normalizeActivityBarItems
};
