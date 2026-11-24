/**
 * 最小第三方设置 UI —— **零 `@linkdesk/ui`** 的可替换性契约夹具（2026-11-24 重建）。
 *
 * 🔴 它存在的唯一目的：证明「第三方不看第一个作者的源码、**不用壳的 UI 库**，只靠公开 API
 *    也能把设置页做成功能等价的东西」。所以本文件：
 *   · 只 import `react` ＋ 本地 CSS —— ⛔ 零 `@linkdesk/ui`、零 `@src`；
 *   · 只读公开数据面：`configuration.*`、`pluginManager.list`、`theme.*`、`fileAssociation.*`、
 *     `commands.executeCommand`、`appearance.pickImage`、`dialog.open`；
 *   · 长相完全自绘（原生元素 + 自己的类名），⛔ 不照抄官方设置页的分组/控件形态。
 *
 * 覆盖：分组/依赖/条件说明、12 种 uiHint 的通用降级、主题选择、AI 权限档位、文件关联管理器
 * （含 A6 的 getOverrides/onDidChangeOverrides）。快捷键页与富文本确认不在本夹具射程（见 README）。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import "./fixture.css";

type Prop = {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  enumDescriptions?: string[] | Record<string, string>;
  minimum?: number;
  maximum?: number;
  step?: number;
  uiHint?: string;
  renderHint?: string;
  dependsOn?: { key: string; value: unknown };
  descriptionWhen?: { key: string; value: unknown; description: string };
  sourceKey?: string;
  effectiveToken?: string;
  actionCommand?: string;
  statusCommand?: string;
  actionDisabledAll?: Array<{ key: string; value: unknown }>;
  assetDomain?: string;
  pickTarget?: string;
  optionsFrom?: string;
  unit?: string;
  allowAlpha?: boolean;
  resetsToTheme?: boolean;
};

type Contribution = [
  string,
  {
    title: string;
    subtitle?: string;
    groupDescriptions?: Record<string, string>;
    properties: Record<string, Prop>;
  },
];

type Handler = { pluginId: string; title: string; displayName: string; isCurrent: boolean };

const lk = () => window.linkdesk;

function useConfiguration() {
  const [contribs, setContribs] = useState<Contribution[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const cfg = lk().configuration;
    void cfg.getConfigurationContributions().then(setContribs);
    const off = cfg.onChange((key, value) => setValues((prev) => ({ ...prev, [key]: value })));
    return off;
  }, []);

  const keys = useMemo(() => {
    const set = new Set<string>();
    for (const [, c] of contribs) for (const k of Object.keys(c.properties ?? {})) set.add(k);
    return [...set].sort();
  }, [contribs]);

  useEffect(() => {
    if (keys.length === 0) return;
    const cfg = lk().configuration;
    void Promise.all(keys.map(async (k) => [k, await cfg.get(k)] as const)).then((pairs) =>
      setValues((prev) => ({ ...prev, ...Object.fromEntries(pairs) })),
    );
  }, [keys]);

  const write = useCallback(async (key: string, value: unknown) => {
    await lk().configuration.set(key, value);
  }, []);

  return { contribs, values, write };
}

/** 只读状态行——按声明跑壳命令，2s 轮询（与官方页同语义，但实现完全自写） */
function StatusLine({ command }: { command: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    let alive = true;
    const run = () =>
      void lk()
        .commands.executeCommand(command)
        .then((v) => {
          if (alive && typeof v === "string") setText(v);
        })
        .catch(() => {});
    run();
    const t = setInterval(run, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [command]);
  return <code className="msu-status">{text || "…"}</code>;
}

/** 文件关联管理器——A6 面：getOverrides/listHandlersFor/setDefaultBulk（⛔ 不读宿主配置键） */
function AssociationManager() {
  const [exts, setExts] = useState<string[]>([]);
  const [handlers, setHandlers] = useState<Record<string, Handler[]>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    const fa = lk().fileAssociation;
    let alive = true;
    void lk()
      .pluginManager.list()
      .then((list) => {
        const set = new Set<string>();
        for (const p of list ?? []) {
          const declared = (p.manifest as { contributes?: { fileAssociations?: Array<{ extension?: string }> } })?.contributes?.fileAssociations ?? [];
          for (const d of declared) if (typeof d?.extension === "string" && d.extension) set.add(d.extension.replace(/^\./, "").toLowerCase());
        }
        const all = [...set].sort();
        if (alive) setExts(all);
        return Promise.all(all.map(async (ext) => [ext, await fa.listHandlersFor(ext).catch(() => [])] as const));
      })
      .then((pairs) => {
        if (alive) setHandlers(Object.fromEntries(pairs));
      })
      .catch(() => {});
    void fa.getOverrides().then((t) => alive && setOverrides(t)).catch(() => {});
    const off = fa.onDidChangeOverrides((t) => alive && setOverrides(t));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const pick = async (ext: string, pluginId: string) => {
    await lk().fileAssociation.setDefault(ext, pluginId || null);
  };

  return (
    <div className="msu-manager">
      <p className="msu-muted">文件类型 → 默认打开者（宿主算出的当前默认；选择即写覆盖表，恢复自动 = 清覆盖）</p>
      {exts.length === 0 && <p className="msu-muted">没有插件声明文件类型。</p>}
      {exts.map((ext) => (
        <div key={ext} className="msu-manager-row">
          <code>.{ext}</code>
          <select value={overrides[ext] ?? ""} onChange={(e) => void pick(ext, e.target.value)}>
            <option value="">（自动：宿主按声明序/角色兜底）</option>
            {(handlers[ext] ?? []).map((h) => (
              <option key={h.pluginId} value={h.pluginId}>
                {h.title}
                {h.isCurrent ? "（当前）" : ""} · {h.displayName}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

/** 主题卡——按 uiHint "themePicker" 认键（⛔ 不写死 app.theme）；写走 theme.setRecipe */
function ThemeSelect({ label, value }: { label: string; value: string }) {
  const [recipes, setRecipes] = useState<Array<{ id: string; name?: string }>>([]);
  useEffect(() => {
    void lk()
      .theme.listRecipes()
      .then((list) => setRecipes(list ?? []))
      .catch(() => {});
  }, []);
  return (
    <div className="msu-row">
      <span className="msu-label">{label}</span>
      <select aria-label={label} value={value} onChange={(e) => void lk().theme.setRecipe(e.target.value)}>
        <option value="">（跟随当前）</option>
        {recipes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name ?? r.id}
          </option>
        ))}
      </select>
    </div>
  );
}

function Row({
  configKey,
  prop,
  value,
  values,
  write,
}: {
  configKey: string;
  prop: Prop;
  value: unknown;
  values: Record<string, unknown>;
  write: (key: string, v: unknown) => Promise<void>;
}) {
  const dep = prop.dependsOn;
  if (dep && values[dep.key] !== undefined && values[dep.key] !== dep.value) return null;

  const when = prop.descriptionWhen;
  const desc = when && values[when.key] === when.value ? when.description : prop.description;
  const label = prop.title ?? configKey;
  const v = value ?? prop.default;

  const common = { className: "msu-row" } as const;

  if (prop.uiHint === "themePicker") {
    return <ThemeSelect label={label} value={String(v ?? "")} />;
  }
  if (prop.renderHint === "readonly") {
    return (
      <div {...common}>
        <span className="msu-label">{label}</span>
        {prop.statusCommand ? <StatusLine command={prop.statusCommand} /> : <span />}
      </div>
    );
  }
  if (prop.renderHint === "action") {
    const disabled = (prop.actionDisabledAll ?? []).every((c) => values[c.key] === c.value);
    return (
      <div {...common}>
        <span className="msu-label">{label}</span>
        <button className="msu-btn" disabled={disabled} onClick={() => prop.actionCommand && void lk().commands.executeCommand(prop.actionCommand, undefined, { settingKey: configKey })}>
          {prop.description ?? label}
        </button>
      </div>
    );
  }
  if (prop.uiHint === "image") {
    return (
      <div {...common}>
        <span className="msu-label">{label}</span>
        <div className="msu-inline">
          <button
            className="msu-btn"
            onClick={async () => {
              if (!prop.assetDomain) return;
              const r = await lk().appearance.pickImage({ domain: prop.assetDomain, target: prop.pickTarget ?? "" });
              if (r.picked) await write(configKey, r.url);
            }}
          >
            选图
          </button>
          <code>{String(v || "")}</code>
          {v !== "" && (
            <button className="msu-btn" onClick={() => void write(configKey, "")}>
              清除
            </button>
          )}
        </div>
      </div>
    );
  }
  if (prop.uiHint === "file" || prop.uiHint === "directory") {
    return (
      <div {...common}>
        <span className="msu-label">{label}</span>
        <div className="msu-inline">
          <input
            value={String(v ?? "")}
            onChange={(e) => void write(configKey, e.target.value)}
            aria-label={label}
          />
          <button
            className="msu-btn"
            onClick={async () => {
              const picked = await lk().dialog.open({ directory: prop.uiHint === "directory" });
              if (picked) await write(configKey, picked);
            }}
          >
            浏览…
          </button>
        </div>
      </div>
    );
  }
  if (prop.enum) {
    const texts = Array.isArray(prop.enumDescriptions) ? prop.enumDescriptions : prop.enum.map((x) => x);
    return (
      <div {...common}>
        <span className="msu-label">{label}</span>
        <div>
          <select value={String(v ?? "")} onChange={(e) => void write(configKey, e.target.value)} aria-label={label}>
            {prop.enum.map((opt, i) => (
              <option key={opt} value={opt}>
                {texts[i] ?? opt}
              </option>
            ))}
          </select>
          {desc && <small className="msu-muted"> {desc}</small>}
        </div>
      </div>
    );
  }
  if (prop.uiHint === "slider" || prop.uiHint === "fontSize" || prop.type === "number") {
    const min = prop.minimum ?? 0;
    const max = prop.maximum ?? 100;
    return (
      <div {...common}>
        <span className="msu-label">{label}</span>
        <div className="msu-inline">
          <input
            type="range"
            min={min}
            max={max}
            step={prop.step ?? 1}
            value={Number(v ?? min)}
            onChange={(e) => void write(configKey, Number(e.target.value))}
            aria-label={label}
          />
          <code>
            {String(v ?? "")}
            {prop.unit ?? ""}
          </code>
        </div>
      </div>
    );
  }
  if (prop.type === "boolean") {
    return (
      <div {...common}>
        <span className="msu-label">{label}</span>
        <input type="checkbox" checked={!!v} onChange={(e) => void write(configKey, e.target.checked)} aria-label={label} />
      </div>
    );
  }
  if (prop.type === "array" || prop.uiHint === "stringList") {
    return (
      <div {...common}>
        <span className="msu-label">{label}</span>
        <textarea
          rows={3}
          value={Array.isArray(v) ? (v as string[]).join("\n") : String(v ?? "")}
          onChange={(e) => void write(configKey, e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
          aria-label={label}
        />
      </div>
    );
  }
  if (prop.uiHint === "color") {
    return (
      <div {...common}>
        <span className="msu-label">{label}</span>
        <input type="color" value={String(v ?? "#000000")} onChange={(e) => void write(configKey, e.target.value)} aria-label={label} />
      </div>
    );
  }
  if (prop.uiHint === "segmented" && prop.enum) {
    return (
      <div {...common}>
        <span className="msu-label">{label}</span>
        <div className="msu-seg" role="radiogroup" aria-label={label}>
          {prop.enum.map((opt) => (
            <button
              key={opt}
              role="radio"
              aria-checked={String(v) === opt}
              className={String(v) === opt ? "is-on" : ""}
              onClick={() => void write(configKey, opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }
  // 未知 hint / string / fontFamily → 文本输入（未知值绝不写穿：只读降级由官方页做，本夹具允许自由输入）
  return (
    <div {...common}>
      <span className="msu-label">{label}</span>
      <input value={String(v ?? "")} onChange={(e) => void write(configKey, e.target.value)} aria-label={label} />
    </div>
  );
}

export default function MinimalSettingsView() {
  const { contribs, values, write } = useConfiguration();
  const [active, setActive] = useState(0);
  const current = contribs[active];
  const groups = useMemo(() => {
    if (!current) return [];
    const map = new Map<string, string[]>();
    for (const key of Object.keys(current[1].properties ?? {})) {
      const g = current[1].properties[key]?.group ?? "";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(key);
    }
    return [...map.entries()];
  }, [current]);

  return (
    <div className="msu-root">
      <nav className="msu-nav">
        {contribs.map(([pluginId, c], i) => (
          <button key={pluginId} className={i === active ? "is-on" : ""} onClick={() => setActive(i)}>
            {c.title}
          </button>
        ))}
      </nav>
      <main className="msu-main">
        {!current && <p className="msu-muted">没有可显示的配置组。</p>}
        {current && <h1>{current[1].title}</h1>}

        {groups.map(([group, keys]) => {
          const managerProp = keys.find((k) => current[1].properties[k]?.uiHint === "fileAssociationsManager");
          return (
            <section key={group || "flat"} className="msu-group">
              {group && <h2>{group}</h2>}
              {group && current[1].groupDescriptions?.[group] && (
                <p className="msu-muted">{current[1].groupDescriptions[group]}</p>
              )}
              {managerProp && <AssociationManager />}
              {keys
                .filter((k) => current[1].properties[k]?.uiHint !== "fileAssociationsManager")
                .map((k) => (
                  <Row key={k} configKey={k} prop={current[1].properties[k]} value={values[k]} values={values} write={write} />
                ))}
            </section>
          );
        })}
      </main>
    </div>
  );
}
