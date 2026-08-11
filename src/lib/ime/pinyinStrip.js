function isRawPinyinCommit(data) {
  if (data.length === 0) return false;
  if (!data.includes(" ")) return false;
  if (!/^[a-zA-Z ]+$/.test(data)) return false;
  if (!/[a-zA-Z]/.test(data)) return false;
  return true;
}
function stripPinyinSpaces(data) {
  return data.replace(/ /g, "");
}
export {
  isRawPinyinCommit,
  stripPinyinSpaces
};
