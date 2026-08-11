import { pinyin } from "pinyin-pro";
const pinyinCache = /* @__PURE__ */ new Map();
const CACHE_MAX = 2e3;
function decomposePinyin(str) {
  const cached = pinyinCache.get(str);
  if (cached) return cached;
  const pinyinArr = pinyin(str, {
    pattern: "pinyin",
    toneType: "none",
    type: "array"
  });
  const info = [];
  let pyIdx = 0;
  let i = 0;
  while (i < str.length) {
    const codePoint = str.codePointAt(i);
    const charLen = codePoint > 65535 ? 2 : 1;
    const char = String.fromCodePoint(codePoint);
    const py = (pinyinArr[pyIdx] ?? char).toLowerCase();
    info.push({
      char,
      pinyin: py,
      firstLetter: py[0] ?? char.toLowerCase(),
      utf16Start: i,
      utf16End: i + charLen
    });
    pyIdx++;
    i += charLen;
  }
  if (pinyinCache.size >= CACHE_MAX) {
    const firstKey = pinyinCache.keys().next().value;
    if (firstKey !== void 0) pinyinCache.delete(firstKey);
  }
  pinyinCache.set(str, info);
  return info;
}
function pinyinMatchRange(query, target) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const targetLower = target.toLowerCase();
  const directIdx = targetLower.indexOf(q);
  if (directIdx !== -1) {
    return [directIdx, directIdx + q.length];
  }
  const info = decomposePinyin(target);
  const fullPinyinParts = [];
  const pinyinStartOffsets = [];
  let pos = 0;
  for (const item of info) {
    pinyinStartOffsets.push(pos);
    fullPinyinParts.push(item.pinyin);
    pos += item.pinyin.length;
  }
  const fullPinyin = fullPinyinParts.join("");
  const pinyinIdx = fullPinyin.indexOf(q);
  if (pinyinIdx !== -1) {
    const matchEnd = pinyinIdx + q.length;
    let startChar = -1;
    let endChar = info.length;
    for (let i = 0; i < info.length; i++) {
      const charStart = pinyinStartOffsets[i];
      const charEnd = charStart + info[i].pinyin.length;
      if (startChar === -1 && charEnd > pinyinIdx) {
        startChar = i;
      }
      if (charEnd >= matchEnd) {
        endChar = i + 1;
        break;
      }
    }
    if (startChar !== -1) {
      return [
        info[startChar].utf16Start,
        info[Math.min(endChar, info.length) - 1].utf16End
      ];
    }
  }
  const firstLetters = info.map((item) => item.firstLetter).join("");
  const flIdx = firstLetters.indexOf(q);
  if (flIdx !== -1) {
    const flEnd = flIdx + q.length;
    return [
      info[flIdx].utf16Start,
      info[Math.min(flEnd, info.length) - 1].utf16End
    ];
  }
  return null;
}
function pinyinIncludes(target, query) {
  return pinyinMatchRange(query, target) !== null;
}
export {
  pinyinIncludes,
  pinyinMatchRange
};
