/**
 * 宿主共享图标默认项——IconRegistry sharedIcon 空间的宿主兜底（04「内置配置组图标声明」2026-11-18）。
 *
 * 四枚本体组图标（通用/主题/AI 接入/默认打开方式）以 **IconRegistry 共享图标名** 为声明值
 * （配置贡献 `icon: "app.group-*"`）——设置页导航（settings 组 iconManifest 空消费链）按名解析，
 * image 默认项在池侧按 **ink 剪影**渲染（mask ＋ --icon-ink，VS Code product-icon 语义）。
 *
 * 🔴 宿主身份 = `pluginId undefined`（appearanceOwnership 裁决：宿主兜底永放行；
 *    插件后到撞名走「宿主占位 → host-reserved 拒」——启动期先注册，先者事实链密不透风）。
 *    sharedIcon 账家族（host-reserved.json 机械加固）未扩列：这四个名字恒被宿主占用，
 *    空位保护对它们无增量——理由全文见案夹 00-README。
 *
 * 资产 = B 方案定稿 SVG（设计稿与几何单源 = 案夹 mockups/gen.py；⛔ 手改 SVG 前先改生成器重跑）。
 * StrictMode 双跑幂等：hasIcon 已占即跳（对标 registerFallbackThemes）。
 */
import { IconRegistry } from "./IconRegistry";
import { getAssetPath } from "../../utils/path/assetPath";

const HOST_GROUP_ICONS = [
  { id: "app.group-general", file: "assets/icons/config-groups/general.svg", description: "Settings nav 'General' group icon (ink silhouette)" },
  { id: "app.group-theme", file: "assets/icons/config-groups/theme.svg", description: "Settings nav 'Theme' group icon (ink silhouette)" },
  { id: "app.group-ai", file: "assets/icons/config-groups/ai.svg", description: "Settings nav 'AI access' group icon (ink silhouette)" },
  { id: "app.group-openwith", file: "assets/icons/config-groups/openwith.svg", description: "Settings nav 'Open with' group icon (ink silhouette)" },
] as const;

export function registerHostGroupIcons(): void {
  for (const it of HOST_GROUP_ICONS) {
    if (IconRegistry.hasIcon(it.id)) continue;
    IconRegistry.registerIcon(it.id, { description: it.description, default: { url: getAssetPath(it.file) } }, undefined);
  }
}
