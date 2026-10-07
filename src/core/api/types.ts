/**
 * Phase 4 core type definitions.
 * Plugin metadata, tab extension fields, view registry entries.
 *
 * Design basis: [[phase4-design-decisions]] + public/schemas/plugin.schema.json
 */

/* ── Plugin type enum ── */

export type PluginType = "view" | "card" | "theme" | "language" | "protocol" | "resource" | "datasource";

/** contributes.themes entry — Modeled after VS Code theme extension point */
export interface ThemeContribution {
  id: string;
  label: string;
  uiTheme: "dark" | "light" | "highContrast";
  path: string;
}

/** contributes.iconThemes entry — Modeled after VS Code productIconThemes extension point */
export interface IconThemeContribution {
  id: string;
  label: string;
  path: string;
}

/** Icon mapping entry — font glyph form (monochrome/multi-color fonts; seti-style fonts carry one color per icon; codicon is the guaranteed monochrome fallback) */
export interface IconThemeGlyph {
  /** CSS class name (codicon fallback / custom icon font asset) */
  class: string;
  /** Optional per-icon color (seti-style color fonts) */
  color?: string;
}

/** Icon mapping entry — image asset form (any multi-color/skeuomorphic/textured art) */
export interface IconThemeImage {
  /** Relative path of the image asset — resolved by the shell at load time to a linkdesk:// absolute URL (getPluginAssetPath); consumers carry zero resolution burden */
  imagePath: string;
}

/** Icon mapping entry — dual form (E5.8#133 ④ decision: font glyph or image asset; a single theme may mix both; the shell performs zero review) */
export type IconThemeMapping = IconThemeGlyph | IconThemeImage;

/** Icon theme mapping table — fileExtensions/fileNames/folderNames → dual-form entries */
export interface IconThemeMappings {
  files?: Record<string, IconThemeMapping>;
  extensions?: Record<string, IconThemeMapping>;
  folders?: Record<string, IconThemeMapping>;
  /** Folder open state — optional; reuses folders when unspecified */
  foldersExpanded?: Record<string, IconThemeMapping>;
  /* ── Default icons (E5.8#133.6: aligns with VS Code iconTheme top-level default keys — use the theme default instead of the codicon fallback when the mapping table misses) ── */
  /** Default file icon — used when files/extensions miss (default = the shell's codicon fallback) */
  file?: IconThemeMapping;
  /** Default folder icon — used when folders miss (default = the shell's codicon fallback) */
  folder?: IconThemeMapping;
  /** Default expanded folder icon — used when foldersExpanded misses (default = the shell's codicon fallback) */
  folderExpanded?: IconThemeMapping;
  /** Root folder icon (default = the shell's codicon fallback) */
  rootFolder?: IconThemeMapping;
  /** Root folder expanded icon (default = the shell's codicon fallback) */
  rootFolderExpanded?: IconThemeMapping;
}

/** contributes.icons entry — Modeled after VS Code icon extension point. Plugins contribute shared icons for other plugins to reference. */
export interface IconContribution {
  description: string;
  default: {
    fontPath?: string;
    fontCharacter?: string;
  };
}

/** contributes.languages entry — Modeled after VS Code language extension point */
export interface LanguageContribution {
  id: string;
  label: string;
  path: string;
}

/** contributes.langDefs entry — programming language definition (Modeled after VS Code contributes.languages) */
export interface LangDefContribution {
  id: string;
  extensions: string[];
  aliases?: string[];
  /** 🔒 Internal — injected at runtime by registerLangDef. Plugin authors should not declare this field in plugin.json. */
  _pluginId?: string;
  monarch?: {
    tokenizer: Record<string, unknown>;
  };
  lsp?: {
    command: string;
    args?: string[];
  };
}

/* ── Tab behavior declaration ── */

export interface TabBehavior {
  /** Auto-create this tab when no tabs are on stage, and it cannot be closed. Only the welcome page declares it. */
  isFallback?: boolean;
  /** Globally only one instance allowed; creating it again → focus the existing one. E.g. the settings page. */
  singleton?: boolean;
  /** Show a confirm dialog before close; the value is the prompt text. E.g. the terminal. */
  confirmOnClose?: string;
  /** The Tauri invoke command called before close (after the confirmOnClose confirmation, before closeTab). E.g. the terminal declares "close_port". */
  invokeBeforeClose?: string;
  /** The unique field in CreateTabOptions used to determine tab identity. null = allow multiple instances without dedup (default).
   *  E.g. workspace declares "workspaceName" — only one tab per workspace name. */
  identityField?: string;
}

/* ── Status bar contribution entry ── */

export interface StatusBarItem {
  id: string;
  icon?: string;
  label: string;
  align?: "left" | "right";
  onClick?: string;
  /** Declare true → the shell auto-registers a config item (<pluginId>.statusBar.<id>) + injects the visible prop.
   *  The plugin author writes one line of JSON and the user can toggle it in the Settings Editor. */
  configurable?: boolean;
}

/* ── Plugin metadata (TS type of plugin.json) ── */

export interface PluginManifest {
  $schema?: string;
  /**
   * Plugin identity — **immutable forever after publication** (Modeled after VS Code's `publisher.name`). The install directory
   * `{userData}/plugins/<pluginId>/`, the distribution artifact name `<pluginId>.linkdesk-plugin`, the marketplace catalog dedup key,
   * the uninstall tombstone key, and update reconciliation all key off it.
   *
   * From L7 (E6#98g) onward **explicit declaration is required**: when undeclared it falls back to the "project directory name" (`derivePluginId`), and since
   * the repo name and the local directory name are free-form, changing the directory name changes the identity — with five consequences (two coexisting copies in the install area / tombstones not matching /
   * two marketplace entries / the update chain silently broken / plugin data seemingly lost) and not one of them reports an error. The fallback path is kept only for backward compatibility
   * with existing third-party plugins outside the repo.
   * Shape constraint `^[A-Za-z0-9][A-Za-z0-9._-]*$` (`SAFE_PLUGIN_ID`, prevents path traversal straight into the filesystem).
   */
  pluginId?: string;
  /** @deprecated Use declarative fields such as contributes + tabBehavior instead — contribution points are detected from the manifest's actual declaration fields (Modeled after VS Code contributes) */
  type?: PluginType;
  core?: boolean;
  /** Plugin role — governs loading strategy only. view = has a UI component, data = pure data. Auto-derived when omitted */
  pluginRole?: "view" | "data";
  name: string;
  version: string;
  icon?: string;
  iconSource?: "codicon" | "svg" | "url" | "lucide";
  /** Marketplace display art (cover art, archive 14's dual-icon model E6#67) — relative path of an svg asset, may be drawn elaborately and complex
   *  (semantically separate from icon's "monochrome small UI icon": the shell's icon bar/tab bar read only icon). Omitted → the marketplace falls back to icon.
   *  Convention: value = a relative path into package resources (e.g. "resources/cover.svg"); iconSource omitted → inferred as a linkdesk:// path. */
  marketIcon?: string;
  marketIconSource?: "codicon" | "svg" | "url" | "lucide";
  description?: string;
  author?: string;
  entry?: string;
  sidebar?: string;
  tabBehavior?: TabBehavior;
  /** System slot role — declares which system-level function this plugin fills. settings = the settings page, marketplace = the plugin marketplace.
   *  Multiple plugins with the same role legitimately coexist (one-to-many, all collected into the slot candidates); default = the stable order of first registration
   *  (E6#18b: core:true carries no behavioral privilege and does not grab the default); the user's switched active suite persists.
   *  E5.7#65: open string — third parties may declare new role names with zero shell changes (FactorySlots looks up by string). */
  factoryRole?: string;
  statusBar?: StatusBarItem[];
  /** @deprecated E5#12 — migrated to contributes.themes. Kept only for normalizeManifest backward compatibility. */
  file?: string;
  /** @deprecated E5#12 — migrated to contributes.themes. Kept only for normalizeManifest backward compatibility. */
  themes?: { id: string; name: string; file: string }[];
  /** @deprecated E5#12 — migrated to contributes.languages. Kept only for normalizeManifest backward compatibility. */
  languages?: { code: string; name: string; file: string }[];
  mode?: "text" | "binary";
  resources?: string[];
  recommends?: { plugin: string; reason: string }[];
  suggests?: { plugin: string; reason: string }[];
  /** Plugin-level activation-order dependencies (E5.8#13) — declared by pluginId; the loader loads dependencies before this plugin.
   *  Pure declaration: no version constraints (version semantics belong to the E6 marketplace domain; activation order does not carry them); missing dependency → the loader state machine parks it PENDING.
   *  A different domain from ConfigurationRegistry's config-item-level dependsOn (one config item within the same manifest depending on another). */
  requires?: string[];
  screenshots?: string[];
  minAppVersion?: string;
  /** @deprecated E5.8#14 — merged into requires (plugin-level activation dependencies are uniformly declared by requires).
   *  Zero plugins use it; the loader reads it for compatibility until the #14 migration lands. */
  extensionDependencies?: string[];
  docs?: string;
  cardDocMap?: Record<string, string>;
  /** @deprecated E5#109 — use contributes.i18n instead. Per-plugin `i18n/{lang}.json`, key = original Chinese text. See [[i18n-round2-leftovers]] */
  i18n?: Record<string, string>;
  cssVars?: Record<string, { dark: string; light: string }>;
  permissions?: ("serial" | "filesystem" | "network")[];

  /**
   * Phase 5g: view metadata — declares how the view interacts with the shell.
   * These fields replace the hardcoded special cases of Phase 3/4 (isSidebarOnlyView / BOTTOM_ICONS etc.).
   */

  /** Where the plugin UI appears — declarative. Replaces iconLocation + viewRole + keepSidebarOnFocus.
   *  Modeled after VS Code: viewsContainers + views combine to derive Activity Bar / Sidebar / Panel */
  appearsIn?: {
    iconBar?: "top" | "bottom";
    sidePanel?: boolean;
    tabBar?: boolean;
    /** W2 admission (decided 2026-10-02: allowlist-based, default false) — declared true to enter the welcome page's "Start" card and the [+] create menu.
     *  ⚠️ Governs only the **display** in those two menus: not declaring ⇏ cannot open (command/recents/session restore/floating panel open-in still open it;
     *  those consumers ask about **capability** — getTabOpenableViews). The value domain matches plugin.schema.json's appearsIn.standaloneOpenable verbatim. */
    standaloneOpenable?: boolean;
    /** Custom-drawn (code) status bar component file path (relative to the plugin root, .tsx) — a combined existence + file declaration (Modeled after the view's render).
     *  A value = the plugin's custom status bar component replaces its static statusBar contribution; at registration the loader's resolveRuntimePluginRoot
     *  normalizes it → ViewPluginEntry.statusBarRenderPath (dev /@fs source / prod linkdesk:// dist; after SDK packaging
     *  this field is rewritten to the statusBar.bundle.js compiled surface), and the shell emits a component marker → the pool dynamic-imports it directly (E6#62d).
     *  Omitted = no custom component (static contribution items proceed as usual). */
    statusBar?: string;
  };
  /** @deprecated E5#14 — replaced by appearsIn.iconBar. Kept only as a backward-compatibility fallback in viewRegistry.ts. */
  iconLocation?: "top" | "bottom";
  /** @deprecated E5#14 — replaced by appearsIn.tabBar / appearsIn.sidePanel. */
  viewRole?: "sidebarPrimary" | "tabOnly";
  /** @deprecated After E2c #19d the shellRendered concept no longer exists — shell-level views are written directly into App.tsx and not declared via plugin.json. Kept only for backward compatibility. */
  shellRendered?: boolean;
  /** @deprecated E5#14 — no longer needed after appearsIn normalization. */
  keepSidebarOnFocus?: boolean;

  /**
   * Phase 5: Modeled after VS Code package.json contributes.
   * Uses Record<string, unknown> to tolerate unknown keys — parseContributions detects each key individually.
   * Types for known keys are in ContributesViewsContainers / ContributesViews below.
   */
  contributes?: Record<string, unknown>;
}

/* ── E5.8#36.5: view action area declaration — contributes.views[].titleActions (travels with the view; consumed in both the panel and the sidebar) ── */

/** Action-area dropdown entry — label is the display text (i18n key), command is executed, args passes through as a single positional argument */
export interface TitleActionItem {
  /** Display text — i18n key (original Chinese text; resolved by the pool's t() — display-text iron rule) */
  label: string;
  /** Command id executed on click */
  command: string;
  /** Command argument — passed through as a single positional argument of executeCommand(command, args) (JSON-serializable; omit if none) */
  args?: unknown;
}

/** Action-area widget — three forms: icon button / dropdown menu / split primary button + dropdown (same as the VS Code terminal [+] + [▾]).
 *  The widget is a general-purpose piece, not built for the terminal — whoever declares it uses it (general APIs are built by the shell first, never waiting for a consumer — plugin-independence iron rule). */
export type TitleActionWidget =
  /** Single icon button — click runs the command */
  | {
      type: "icon";
      id: string;
      command: string;
      /** codicon class name (e.g. "codicon-add") — the pool renders `<span className={`codicon ${icon}`} />` */
      icon: string;
      /** tooltip / aria-label — i18n key */
      title: string;
      args?: unknown;
    }
  /** Pure dropdown — the chevron button expands the items list */
  | {
      type: "dropdown";
      id: string;
      items: TitleActionItem[];
      /** chevron tooltip — i18n key */
      title?: string;
    }
  /** Split primary button + dropdown — the primary button runs the command (default action); the chevron on the right expands the items alternatives */
  | {
      type: "split";
      id: string;
      command: string;
      /** Primary button icon — when there is no icon, the title (after t()) is used as a text button */
      icon?: string;
      /** Primary button tooltip / aria-label / text when there is no icon — i18n key */
      title: string;
      items: TitleActionItem[];
      args?: unknown;
    };

/* ── E3.6: contributes known-key types — for `as` type assertions, safe consumer-side access ── */

/** Shape of contributes.viewsContainers */
export interface ContributesViewsContainers {
  [containerId: string]: {
    title: string;
    icon?: string;
    location?: "sidebar" | "panel" | "auxiliarybar" | "main";
    hideIfEmpty?: boolean;
    order?: number;
    mergeHeaderWhenSingle?: boolean;
  };
}

/** Shape of contributes.views */
export interface ContributesViews {
  [containerId: string]: Array<{
    id: string;
    title?: string;
    render: string;
    role?: "toolbar" | "section";
    when?: string;
    order?: number;
    collapsed?: boolean;
    canToggleVisibility?: boolean;
    canMoveView?: boolean;
    hideByDefault?: boolean;
    singleViewPaneContainerTitle?: string;
    titleDescription?: string;
    showActions?: "always" | "whenExpanded" | "default";
    titleTooltip?: string;
    /** Panel-area dock minimum height (E5.7#63.7: consumed by ViewContainerService) — schema supplemented in E5.8#1c */
    minHeight?: number;
    /** View action area declaration (E5.8#36.5) — the widget list on the right of the panel tab bar / sidebar header. Travels with the view and migrates with it */
    titleActions?: TitleActionWidget[];
  }>;
}

/** Floating panel "first-open form" — the shell-owned **form vocabulary** (the declaring side and config values share one set; the value is the form, no mapping layer).
 *  'floatingPanel' = the in-shell floating panel; 'tab' = a tab.
 *  Division of labor: the plugin only **declares** which one it wants (defaultForm/formKey); the shell **decides and executes** (openTab / panel:reveal-floating). */
export type FloatingPanelOpenForm = "floatingPanel" | "tab";

/** Shape of contributes.floatingPanel — declares that a view can be shown in the in-shell floating panel (E5.8#39.5 type B).
 *  viewId must reference a view already registered in contributes.views — the declarative addressing resolves pluginId/renderPath/title.
 *  First declarer = settings (#38 Ctrl+, opens the panel); the second declarer validating the carrier = the floating-panel-demo test plugin. */
export interface ContributesFloatingPanel {
  /** View ID — a view registered in contributes.views (only views declaring floatingPanel get the "open in floating panel" context item I8-3) */
  viewId: string;
  /** Which form the **first open** uses (fixed by the author, no user entry point) — undeclared = original behavior (panel if a panel exists).
   *  ⛔ Mutually exclusive with formKey (mechanically rejected by plugin.schema.json): one form with two sources ⇒ it becomes undefined whether the key's default or this field wins. */
  defaultForm?: FloatingPanelOpenForm;
  /** User config key for the **first-open** form — declaring it adds the item to the settings page and the user picks it; the key's `default` is the author's default form
   *  (hence mutually exclusive with defaultForm). Key = a type:"string" key in the same plugin's contributes.configuration;
   *  value = the form vocabulary above; key undeclared / value outside the vocabulary ⇒ degrade to defaultForm → none (no crash, makes noise). */
  formKey?: string;
}

/* ── View plugin registry entry ── */

export interface ViewPluginEntry {
  pluginId: string;
  manifest: PluginManifest;
  /** E6#62d: normalized URL of the plugin's custom status bar component (declared at manifest.appearsIn.statusBar) — assembled by resolveRuntimePluginRoot
   *  at loader registration: dev /@fs source .tsx, prod linkdesk:// dist (after SDK packaging the manifest's appearsIn.statusBar is rewritten
   *  to statusBar.bundle.js → the URL points straight at the compiled surface). The shell's statusbar.ts reads this and emits
   *  a component marker (componentRenderPath) → the pool dynamic-imports it directly. Undeclared / root resolution failure = none. */
  statusBarRenderPath?: string;
}

/* ── Tab type extensions (Phase 4) ── */

/**
 * Optional parameters of createTab.
 * VS Code counterpart: the options when opening an editor (viewColumn / preview / label etc.).
 * Note: this is not Partial<Tab> — only fields intentionally exposed are listed, preventing callers from overwriting internal state.
 */
export interface CreateTabOptions {
  /** Plugin ID (which plugin renders, for view type) */
  pluginId?: string;
  /** Target plugin ID of a plugin-detail tab */
  detailPluginId?: string;
  /** Workspace name (for workspace type) */
  workspaceName?: string;
  /** File path (for editor type) */
  filePath?: string;
  /** Custom tab label */
  label?: string;
  /** Whether pinned (false = preview mode, Modeled after the VS Code preview editor) */
  pinned?: boolean;
  /** Data source ID */
  sourceId?: string;
  /** Target panel group ID (which panel to land in when splitting) */
  targetGroupId?: string;
}

/**
 * Tab.type is kept as a logical role (terminal / workspace / settings / welcome).
 * The new pluginId specifies which plugin implements the role — rendering goes by pluginId, rules go by type.
 * For the type→pluginId mapping during legacy layout restore, see tabIdentity.ts's resolveLegacyPluginId.
 */
