const SECTION_SIZE = 30;
const SECTION_MAX = Math.round(SECTION_SIZE * 1.6);
const SECTION_MERGE_BELOW = Math.round(SECTION_SIZE * 0.5);
function splitIntoSections(blocks) {
  if (blocks.length === 0) {
    return [{ id: "sec-0", blocks: [] }];
  }
  const sections = [];
  for (let i = 0; i < blocks.length; i += SECTION_SIZE) {
    sections.push({
      id: `sec-${i / SECTION_SIZE}`,
      blocks: blocks.slice(i, i + SECTION_SIZE)
    });
  }
  if (sections.length > 1) {
    const last = sections[sections.length - 1];
    if (last.blocks.length <= SECTION_MERGE_BELOW) {
      const prev = sections[sections.length - 2];
      prev.blocks = [...prev.blocks, ...last.blocks];
      sections.pop();
    }
  }
  return sections;
}
export {
  SECTION_MAX,
  SECTION_MERGE_BELOW,
  SECTION_SIZE,
  splitIntoSections
};
