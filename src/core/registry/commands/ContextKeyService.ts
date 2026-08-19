/**
 * Context Key 系统——对标 VS Code context key + when clause。
 * Phase 5 柱子 6.1：全局状态机 → 命令/菜单的 when 条件引擎。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §6.1
 * VS Code 对标：IContextKeyService + when clause parser
 * VS Code 源码：src/vs/platform/contextkey/common/contextkey.ts — ContextKeyExprParser
 *
 * 合法 token：&& || ! == != =~ in true false
 * 表达式示例：
 *   "activeEditor"                     — truthy check
 *   "!activeEditor"                    — negation
 *   "activeEditor && editorCount"      — AND
 *   "activeEditor == 'terminal'"     — equality
 *   "editorCount != 0"               — inequality
 *   "langId =~ /^markdown/"          — regex match (Phase 5 parser 支持，Phase 6 消费)
 *   "langId in ['html','css','xml']" — set membership
 */

/* ── 表达式 AST ── */

type ExprNode =
  | { type: "true" }
  | { type: "false" }
  | { type: "key"; value: string }
  | { type: "not"; operand: ExprNode }
  | { type: "and"; left: ExprNode; right: ExprNode }
  | { type: "or"; left: ExprNode; right: ExprNode }
  | { type: "eq"; key: string; value: string }
  | { type: "neq"; key: string; value: string }
  | { type: "regex"; key: string; pattern: string }
  | { type: "in"; key: string; values: string[] };

/* ── Tokenizer ── */

type Token =
  | { type: "KEY"; value: string }
  | { type: "STRING"; value: string }
  | { type: "NUMBER"; value: number }
  | { type: "AND" }
  | { type: "OR" }
  | { type: "NOT" }
  | { type: "EQ" }
  | { type: "NEQ" }
  | { type: "REGEX" }
  | { type: "IN" }
  | { type: "TRUE" }
  | { type: "FALSE" }
  | { type: "LPAREN" }
  | { type: "RPAREN" }
  | { type: "LBRACKET" }
  | { type: "RBRACKET" }
  | { type: "COMMA" }
  | { type: "EOF" };

class Tokenizer {
  private pos = 0;
  private readonly input: string;

  constructor(input: string) {
    this.input = input.trim();
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && this.input[this.pos] === " ") {
      this.pos++;
    }
  }

  next(): Token {
    this.skipWhitespace();
    if (this.pos >= this.input.length) return { type: "EOF" };

    const ch = this.input[this.pos];

    // 字符串字面量——单引号
    if (ch === "'") {
      this.pos++;
      let str = "";
      while (this.pos < this.input.length && this.input[this.pos] !== "'") {
        if (this.input[this.pos] === "\\" && this.pos + 1 < this.input.length) {
          this.pos++;
          str += this.input[this.pos];
        } else {
          str += this.input[this.pos];
        }
        this.pos++;
      }
      this.pos++; // skip closing '
      return { type: "STRING", value: str };
    }

    // 数字
    if (ch >= "0" && ch <= "9") {
      let num = "";
      while (this.pos < this.input.length && this.input[this.pos] >= "0" && this.input[this.pos] <= "9") {
        num += this.input[this.pos];
        this.pos++;
      }
      return { type: "NUMBER", value: parseInt(num, 10) };
    }

    // 双字符操作符
    if (ch === "&" && this.input[this.pos + 1] === "&") {
      this.pos += 2;
      return { type: "AND" };
    }
    if (ch === "|" && this.input[this.pos + 1] === "|") {
      this.pos += 2;
      return { type: "OR" };
    }
    if (ch === "!" && this.input[this.pos + 1] === "=") {
      this.pos += 2;
      return { type: "NEQ" };
    }
    if (ch === "=" && this.input[this.pos + 1] === "=") {
      this.pos += 2;
      return { type: "EQ" };
    }
    if (ch === "=" && this.input[this.pos + 1] === "~") {
      this.pos += 2;
      return { type: "REGEX" };
    }

    // 单字符
    if (ch === "!") { this.pos++; return { type: "NOT" }; }
    if (ch === "(") { this.pos++; return { type: "LPAREN" }; }
    if (ch === ")") { this.pos++; return { type: "RPAREN" }; }
    if (ch === "[") { this.pos++; return { type: "LBRACKET" }; }
    if (ch === "]") { this.pos++; return { type: "RBRACKET" }; }
    if (ch === ",") { this.pos++; return { type: "COMMA" }; }

    // 标识符 / 关键字
    let ident = "";
    while (
      this.pos < this.input.length &&
      this.input[this.pos] !== " " &&
      !"&|!=~()[],'".includes(this.input[this.pos])
    ) {
      ident += this.input[this.pos];
      this.pos++;
    }

    if (ident === "true") return { type: "TRUE" };
    if (ident === "false") return { type: "FALSE" };
    if (ident === "in") return { type: "IN" };

    return { type: "KEY", value: ident };
  }
}

/* ── Recursive Descent Parser ── */

class WhenParser {
  private tokenizer!: Tokenizer;
  private current!: Token;

  parse(input: string): ExprNode {
    this.tokenizer = new Tokenizer(input);
    this.advance();
    const expr = this.parseOr();
    if (this.current.type !== "EOF") {
      throw new Error(`Unexpected token at end of expression: ${JSON.stringify(this.current)}`);
    }
    return expr;
  }

  private advance(): Token {
    this.current = this.tokenizer.next();
    return this.current;
  }

  /** 读取下一个 token 并返回——不通过 this.current，避免 TS narrowing */
  private readNext(): Token {
    this.current = this.tokenizer.next();
    return this.current;
  }

  // or_expr := and_expr ('||' and_expr)*
  private parseOr(): ExprNode {
    let left = this.parseAnd();
    while (this.current.type === "OR") {
      this.advance();
      left = { type: "or", left, right: this.parseAnd() };
    }
    return left;
  }

  // and_expr := primary ('&&' primary)*
  private parseAnd(): ExprNode {
    let left = this.parsePrimary();
    while (this.current.type === "AND") {
      this.advance();
      left = { type: "and", left, right: this.parsePrimary() };
    }
    return left;
  }

  // primary := '!'? atom
  private parsePrimary(): ExprNode {
    if (this.current.type === "NOT") {
      this.advance();
      return { type: "not", operand: this.parsePrimary() };
    }
    return this.parseAtom();
  }

  // atom := 'true' | 'false' | '(' or_expr ')' | key [op value]
  private parseAtom(): ExprNode {
    // 捕获当前 token 到局部变量——后续操作都用局部变量，避免 TS narrowing 问题
    const token = this.current;
    switch (token.type) {
      case "TRUE":
        this.advance();
        return { type: "true" };
      case "FALSE":
        this.advance();
        return { type: "false" };
      case "LPAREN": {
        this.advance();
        const expr = this.parseOr();
        if (this.current.type !== "RPAREN") {
          throw new Error(`Expected RPAREN, got ${this.current.type}`);
        }
        this.advance();
        return expr;
      }
      case "KEY": {
        const key = token.value;
        // 前进到下一个 token
        const next = this.advance();
        switch (next.type) {
          case "EQ": {
            this.advance();
            const val = this.parseLiteral();
            return { type: "eq", key, value: val };
          }
          case "NEQ": {
            this.advance();
            const val = this.parseLiteral();
            return { type: "neq", key, value: val };
          }
          case "REGEX": {
            this.advance();
            const pattern = this.parseLiteral();
            return { type: "regex", key, pattern };
          }
          case "IN": {
            // 期望 '[' — 用 readNext() 绕过 TS narrowing
            const bracket = this.readNext();
            if (bracket.type !== "LBRACKET") {
              throw new Error(`Expected LBRACKET, got ${bracket.type}`);
            }
            // 解析值列表：值以逗号分隔。
            // 流程：readNext 读值 → parseLiteral 消费值并 advance 到逗号或 ] →
            //       检查 this.current，是 COMMA → readNext 跳逗号读下一个值 → 循环
            const values: string[] = [];
            const first = this.readNext(); // 读 ']' 或第一个值
            if (first.type === "RBRACKET") {
              this.advance(); // 消费 ']' → this.current = 后续 token（EOF 或 && 等）
              return { type: "in", key, values }; // 空列表
            }
            // first 是字符串字面量
            this.current = first;
            values.push(this.parseLiteral()); // 消费值 → this.current = COMMA 或 RBRACKET
            while (this.current.type === "COMMA") {
              this.readNext(); // 跳过逗号 → this.current = 下一个值
              values.push(this.parseLiteral()); // 消费值 → this.current = COMMA 或 RBRACKET
            }
            // TS narrows RBRACKET out of this.current.type after the while loop——
            // 用 String() 绕过。语义等价：this.current.type !== "RBRACKET"
            if (String(this.current.type) !== "RBRACKET") {
              throw new Error(`Expected RBRACKET or COMMA, got ${String(this.current.type)}`);
            }
            this.advance(); // 消费 ']' → this.current = 下一个 token
            return { type: "in", key, values };
          }
          default:
            // 裸 key——truthy check
            return { type: "key", value: key };
        }
      }
      default:
        throw new Error(`Unexpected token in expression: ${JSON.stringify(token)}`);
    }
  }

  private parseLiteral(): string {
    if (this.current.type === "STRING") {
      const val = this.current.value;
      this.advance();
      return val;
    }
    if (this.current.type === "NUMBER") {
      const val = String(this.current.value);
      this.advance();
      return val;
    }
    throw new Error(`Expected literal (string or number), got ${this.current.type}`);
  }
}

/* ── ContextKeyService ── */

type ContextKeyChangeListener = (key: string, value: unknown) => void;

class ContextKeyServiceImpl {
  private _state = new Map<string, unknown>();
  private _listeners = new Set<ContextKeyChangeListener>();

  /** E5#19b fix: preload 同步 store 的 getter——注入式，不直接耦合 window.linkdesk */
  private _externalGetter: ((key: string) => unknown) | null = null;

  /** 注册外部 getter——App 初始化时注入 preload 的同步 context key store。
   *  E5.8#10：全局值源 hook（壳服务生命周期 = 应用生命周期，非插件作用域）——
   *  返 disposer 不 trackRegistration（设计 §5 定案）。 */
  registerExternalGetter(fn: (key: string) => unknown): () => void {
    this._externalGetter = fn;
    return () => {
      if (this._externalGetter === fn) {
        this._externalGetter = null;
      }
    };
  }

  /** 设置 context key 值——对标 VS Code setContext */
  setValue(key: string, value: unknown): void {
    const old = this._state.get(key);
    if (old === value) return; // 值未变，不触发通知
    this._state.set(key, value);
    for (const fn of this._listeners) {
      try { fn(key, value); } catch { /* 监听器异常不阻断 */ }
    }
  }

  /** 获取 context key 值——preload 同步 store 优先，_state 兜底 */
  getValue<T>(key: string): T | undefined {
    return this._readValue(key) as T | undefined;
  }

  /** 获取所有 context key（调试用） */
  getState(): ReadonlyMap<string, unknown> {
    return this._state;
  }

  /**
   * 求值 when 表达式——对标 VS Code when clause 引擎。
   *
   * 返回 true = 条件满足（菜单项显示 / 命令可执行）。
   * 返回 false = 条件不满足（菜单项隐藏 / 命令禁用）。
   * 空字符串 → 无条件 = 始终满足。
   */
  /**
   * 求值 when 表达式。
   * @param overrides 优先于全局 state 的上下文键值——ContextMenu 的 context prop 传入
   */
  matches(expression: string | undefined, overrides?: Record<string, unknown>): boolean {
    if (!expression || expression.trim() === "") return true;

    try {
      const parser = new WhenParser();
      const ast = parser.parse(expression);
      return this.evaluate(ast, overrides);
    } catch (err) {
      console.warn(`[ContextKeyService] when 表达式解析失败: "${expression}"`, err);
      return false; // 解析失败 → 安全起见，不显示
    }
  }

  /** 读取 context key——external getter 优先（preload 同步 store），_state 兜底 */
  private _readValue(key: string): unknown {
    if (this._externalGetter) {
      const v = this._externalGetter(key);
      if (v !== undefined) return v;
    }
    return this._state.get(key);
  }

  /** 递归求值 AST——overrides 优先于全局 _state */
  private evaluate(node: ExprNode, overrides?: Record<string, unknown>): boolean {
    switch (node.type) {
      case "true":
        return true;
      case "false":
        return false;
      case "key":
        if (overrides && node.value in overrides) return !!overrides[node.value];
        return !!this._readValue(node.value);
      case "not":
        return !this.evaluate(node.operand, overrides);
      case "and":
        return this.evaluate(node.left, overrides) && this.evaluate(node.right, overrides);
      case "or":
        return this.evaluate(node.left, overrides) || this.evaluate(node.right, overrides);
      case "eq": {
        const val = this._readValue(node.key);
        return String(val ?? "") === node.value;
      }
      case "neq": {
        const val = this._readValue(node.key);
        return String(val ?? "") !== node.value;
      }
      case "regex": {
        const val = String(this._readValue(node.key) ?? "");
        try {
          return new RegExp(node.pattern).test(val);
        } catch {
          return false;
        }
      }
      case "in": {
        const val = String(this._readValue(node.key) ?? "");
        return node.values.includes(val);
      }
    }
  }

  /** Phase 5 初始化核心 context key——串口键已随 E5.8#47 外推（插件自设 sourceOpen） */
  initCoreKeys(): void {
    this._state.set("activeEditor", null);
    this._state.set("editorHasSelection", false);
    this._state.set("editorCount", 0);
  }

  /** 订阅 context key 变化——对标 VS Code onDidChangeContext */
  onDidChangeContext(fn: ContextKeyChangeListener): () => void {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  }

  /** 清空状态（测试用） */
  clear(): void {
    this._state.clear();
    this._listeners.clear();
  }
}

/** 全局单例 */
export const ContextKeyService = new ContextKeyServiceImpl();
