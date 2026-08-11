function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const val = bytes / Math.pow(1024, i);
  return `${i === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[i]}`;
}
function getExtension(fileName) {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}
const MIME_MAP = {
  // HTML / SVG
  html: "text/html",
  htm: "text/html",
  svg: "image/svg+xml",
  // PDF
  pdf: "application/pdf",
  // DOCX
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  // Audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
  m4a: "audio/mp4",
  // Video
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  // Structured data
  json: "application/json",
  xml: "application/xml"
};
function getMimeType(ext) {
  return MIME_MAP[ext.toLowerCase()] || "application/octet-stream";
}
const TEXT_MIME_PREFIXES = [
  "text/",
  "application/json",
  "application/xml",
  "application/javascript",
  "image/svg+xml"
];
function ensureUtf8Charset(dataUrl) {
  if (!dataUrl.startsWith("data:")) return dataUrl;
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) return dataUrl;
  const header = dataUrl.substring(5, commaIdx);
  if (header.includes("charset")) return dataUrl;
  const isBase64 = header.includes("base64");
  const mime = header.replace(";base64", "").trim();
  if (!TEXT_MIME_PREFIXES.some((p) => mime.startsWith(p))) return dataUrl;
  const newHeader = `${mime};charset=utf-8${isBase64 ? ";base64" : ""}`;
  return `data:${newHeader},${dataUrl.substring(commaIdx + 1)}`;
}
const FILE_EXTENSIONS = [
  "html",
  "htm",
  "pdf",
  "docx",
  "txt",
  "md",
  "json",
  "csv",
  "xml",
  "yaml",
  "yml",
  "js",
  "ts",
  "jsx",
  "tsx",
  "css",
  "scss",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "php",
  "sh",
  "sql",
  "toml",
  "ini",
  "log",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  // Audio
  "mp3",
  "wav",
  "ogg",
  "flac",
  "aac",
  "m4a",
  // Video
  "mp4",
  "webm",
  "mov",
  "avi",
  "mkv"
];
const TEXT_EXTENSIONS = /* @__PURE__ */ new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "xml",
  "yaml",
  "yml",
  "js",
  "ts",
  "jsx",
  "tsx",
  "css",
  "scss",
  "less",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "php",
  "sh",
  "bash",
  "zsh",
  "sql",
  "graphql",
  "toml",
  "ini",
  "conf",
  "config",
  "env",
  "log",
  "diff",
  "dockerfile"
]);
function getPreviewCategory(fileType, fileName) {
  const ext = getExtension(fileName);
  if (fileType === "text/html" || ext === "html" || ext === "htm") return "html";
  if (fileType === "image/svg+xml" || ext === "svg") return "html";
  if (fileType === "application/pdf" || ext === "pdf") return "pdf";
  if (fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || ext === "docx")
    return "docx";
  if (fileType.startsWith("image/")) return "image";
  if (fileType.startsWith("audio/")) return "audio";
  if (fileType.startsWith("video/")) return "video";
  if (fileType.startsWith("text/") || TEXT_EXTENSIONS.has(ext) || ext === "dockerfile")
    return "text";
  return "other";
}
function getCategoryLabel(category) {
  switch (category) {
    case "html":
      return "HTML";
    case "pdf":
      return "PDF";
    case "docx":
      return "DOCX";
    case "image":
      return "IMAGE";
    case "audio":
      return "AUDIO";
    case "video":
      return "VIDEO";
    case "text":
      return "TEXT";
    default:
      return "FILE";
  }
}
export {
  FILE_EXTENSIONS,
  ensureUtf8Charset,
  formatFileSize,
  getCategoryLabel,
  getExtension,
  getMimeType,
  getPreviewCategory
};
