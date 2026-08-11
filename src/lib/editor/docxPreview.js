async function docxToHtml(src) {
  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await (await fetch(src)).arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value || '<p style="color:#999;">Empty document</p>';
}
export {
  docxToHtml
};
