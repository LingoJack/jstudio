/**
 * 拼音提交检测与去空格处理 —— 终端 + 编辑器共用。
 *
 * ┌─ 背景 ─────────────────────────────────────────────────────────────┐
 * │ 用户在中文输入法下输入拼音（如 "ni hao"），未选词就切换到英文输入法  │
 * │ （Shift / CapsLock / 菜单切换）时，输入法会把候选框里当前正在输入的   │
 * │ 原始拼音串（字母 + 空格分隔）直接提交到光标。这串文本带着拼音分词用   │
 * │ 的空格，并不是用户真正想输入的内容。                                  │
 * │                                                                      │
 * │ 期望行为：把空格去掉后（"ni hao" → "nihao"）再插入光标。              │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * 判断"原始拼音串"的特征：
 *   - 包含至少一个空格（拼音分词符）
 *   - 全部由 ASCII 字母和空格组成
 *   - 包含至少一个字母（排除纯空格）
 *
 * 正常选词提交的 data 是中文（不含空格），不会被命中；正常英文输入不触发
 * composition，也不受影响。因此该判断安全、误伤面极小。
 */

/**
 * 判断一段文本是否为"中文输入法未转换的原始拼音串"（带空格、纯 ASCII 字母）。
 */
export function isRawPinyinCommit(data: string): boolean {
  if (data.length === 0) return false;
  if (!data.includes(' ')) return false;
  // 只允许 ASCII 字母和空格。
  if (!/^[a-zA-Z ]+$/.test(data)) return false;
  // 必须含至少一个字母（排除纯空格串）。
  if (!/[a-zA-Z]/.test(data)) return false;
  return true;
}

/**
 * 去掉拼音串里的所有空格，返回紧凑形式（"ni hao" → "nihao"）。
 */
export function stripPinyinSpaces(data: string): string {
  return data.replace(/ /g, '');
}
