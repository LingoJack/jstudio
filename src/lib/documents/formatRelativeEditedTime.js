import { formatDate } from "../commandPalette/shared";
function formatRelativeEditedTime(iso, t, language) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const diff = (Date.now() - ms) / 1e3;
  if (diff < 60) return t("agent.justNow");
  if (diff < 3600) return t("agent.minutesAgo", { n: Math.floor(diff / 60) });
  if (diff < 86400) return t("agent.hoursAgo", { n: Math.floor(diff / 3600) });
  if (diff < 172800) return t("agent.yesterday");
  if (diff < 604800) return t("agent.daysAgo", { n: Math.floor(diff / 86400) });
  return formatDate(ms, language);
}
export {
  formatRelativeEditedTime
};
