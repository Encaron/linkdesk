/**
 * 可替换性契约测试夹具 —— **最小第三方设置 UI**（2026-11-24 · D3）。
 *
 * 🔴 它存在的唯一目的：证明「第三方不看第一个作者的源码也能做对」。
 *   · 只读配置声明（`getConfigurationContributions` / `getSchema`）；
 *   · 只按 `uiHint` / `group` / `enum` / `dependsOn` / `descriptionWhen` / `assetDomain` / `pickTarget` 渲染；
 *   · 写配置走 `configuration.set`；选图走 `appearance.pickImage({domain,target})`。
 *   · ⛔ 零宿主义字面量：不出现 `app.` 键名、不拼路径、不自造 `linkdesk://`、不读 `pluginState("app",…)`。
 *
 * 不发布、不进市场；由 `npm run test:replaceability` 校验其形状，CDP 场景见同目录 README。
 */

import { useEffect, useMemo, useState } from "react";

type Prop = {
  type?: string;
  title?: string;
  description?: string;
  enum?: string[];
  uiHint?: string;
  dependsOn?: { key: string; value: unknown };
  descriptionWhen?: { key: string; value: unknown; description: string };
  assetDomain?: string;
  pickTarget?: string;
  sourceKey?: string;
  sourceActiveWhen?: { key: string; value: unknown };
  sourceFollowValue?: string;
};

type Contribution = [
  string,
  { title: string; properties: Record<string, Prop>; groupDescriptions?: Record<string, string> },
];

export default function MinimalSettingsView() {
  const [contribs, setContribs] = useState<Contribution[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const cfg = window.linkdesk.configuration;
    void cfg.getConfigurationContributions().then(setContribs);
    const off = cfg.onChange((key, value) => setValues((prev) => ({ ...prev, [key]: value })));
    return off;
  }, []);

  // 通用依赖求值——任何插件的 dependsOn 键都能算（本夹具不特判任何键）
  const dependencyKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const [, c] of contribs) {
      for (const p of Object.values(c.properties ?? {})) {
        if (p.dependsOn?.key) keys.add(p.dependsOn.key);
        if (p.descriptionWhen?.key) keys.add(p.descriptionWhen.key);
      }
    }
    return [...keys];
  }, [contribs]);

  useEffect(() => {
    const cfg = window.linkdesk.configuration;
    for (const key of dependencyKeys) {
      void cfg.get(key).then((v) => setValues((prev) => ({ ...prev, [key]: v })));
    }
  }, [dependencyKeys]);

  const write = (key: string, value: unknown) => {
    void window.linkdesk.configuration.set(key, value);
  };

  return (
    <div style={{ padding: 16, fontFamily: "var(--font-ui)", color: "var(--text-primary)" }}>
      {contribs.map(([pluginId, contrib]) => (
        <section key={pluginId}>
          <h2>{contrib.title}</h2>
          {Object.entries(contrib.properties ?? {}).map(([key, prop]) => {
            const dep = prop.dependsOn;
            if (dep && dependencyKeys.length) {
              const depValue = values[dep.key];
              if (depValue !== undefined && depValue !== dep.value) return null;
            }
            const when = prop.descriptionWhen;
            const desc =
              when && values[when.key] === when.value ? when.description : prop.description;
            const value = values[key];

            if (prop.uiHint === "image" && prop.assetDomain) {
              return (
                <div key={key} style={{ marginBottom: 8 }}>
                  <label>{prop.title ?? key}</label>
                  <button
                    onClick={async () => {
                      const picked = await window.linkdesk.appearance.pickImage({
                        domain: prop.assetDomain as string,
                        target: prop.pickTarget ?? "",
                      });
                      if (picked.picked) write(key, picked.url);
                    }}
                  >
                    {desc ?? key}
                  </button>
                  <code>{String(value ?? "")}</code>
                </div>
              );
            }

            if (prop.enum) {
              return (
                <div key={key} style={{ marginBottom: 8 }}>
                  <label>{prop.title ?? key}</label>
                  <select value={String(value ?? "")} onChange={(e) => write(key, e.target.value)}>
                    {prop.enum.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  {desc && <small>{desc}</small>}
                </div>
              );
            }

            return (
              <div key={key} style={{ marginBottom: 8 }}>
                <label>{prop.title ?? key}</label>
                <input
                  value={String(value ?? "")}
                  onChange={(e) => write(key, e.target.value)}
                />
                {desc && <small>{desc}</small>}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
