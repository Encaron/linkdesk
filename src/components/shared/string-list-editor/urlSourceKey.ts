/**
 * urlSourceKey — URL 源身份（E6#30c：设置 / 市场两扇「加源」门共用同一去重身份——单一实现）。
 *
 * github.com 仓库主页（含 tree/blob 尾）与 raw.githubusercontent.com 直链（任意分支/路径尾）
 * → 小写 `owner/repo`。分支无关（main/HEAD/仓库主页通吃）——URL 精确串比较会让「官方 main 直链
 * vs 仓库主页归一 HEAD」永不相等、官方源漏判（E6#30c 实测）。返回 null = 非 GitHub 源（调用方
 * 回退精确串比较）。
 *
 * 只用于「是否同一源」身份判别，不用于 fetch（fetch 走各自归一产物，形态不可互换）。
 * 单一实现居此——marketplace（marketSources/SearchView）与 settings（StringListEditor itemKey）
 * 都经 @linkdesk/ui barrel 消费，两扇门 + 未来门收敛同一条规则（硬约束：同一逻辑只一处写）。
 */
export function urlSourceKey(input: string): string | null {
  const m = /^https?:\/\/(?:github\.com|raw\.githubusercontent\.com)\/([^/]+)\/([^/?#]+)/i.exec(input.trim());
  if (!m) return null;
  return `${m[1].toLowerCase()}/${m[2].toLowerCase()}`;
}
