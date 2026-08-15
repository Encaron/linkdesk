/**
 * DemoTodoView——panel-demo 插件「待办」视图。E5.7#63.7 底部面板验证载体。
 *
 * 验证点：
 *   - keep-alive：全部视图平级渲染 display 切换（PanelZone 同 MainZone TabContent 模式），
 *     本视图状态只存 useState（刻意不落 localStorage）——切到「输出」再回来，
 *     勾选/新增/删除全部保留。状态丢了 = keep-alive 失效 = #63.7 回归。
 *   - 面板内 React 自由度：插件视图契约只有 { isActive }，表单/列表/交互全自由发挥。
 *
 * 插件零 @src import（插件独立铁律）——只 import react / react-i18next / 本插件 css。
 */

import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import "../styles/DemoViews.css";

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

/** 种子待办——演示数据（内容 = 数据，不属 UI 文字铁律范围） */
const SEED_TODOS: Todo[] = [
  { id: 1, text: "勾选我——keep-alive 状态演示", done: true },
  { id: 2, text: "切到「输出」标签再回来，我还在", done: false },
  { id: 3, text: "拖顶部 4px 分隔线调面板高度", done: false },
];

export default function DemoTodoView() {
  const { t } = useTranslation();
  const [todos, setTodos] = useState<Todo[]>(SEED_TODOS);
  const [draft, setDraft] = useState("");
  const nextIdRef = useRef(SEED_TODOS.length + 1); // 仅 id 计数器——渲染决策全走 useState（硬约束 17）

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    setTodos((prev) => [...prev, { id: nextIdRef.current++, text, done: false }]);
    setDraft("");
  };

  const toggle = (id: number) => {
    setTodos((prev) => prev.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  };

  const remove = (id: number) => {
    setTodos((prev) => prev.filter((x) => x.id !== id));
  };

  const doneCount = todos.filter((x) => x.done).length;

  return (
    <div className="demo-todo">
      <form
        className="demo-todo-form"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className="demo-todo-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("输入待办事项，回车添加")}
          aria-label={t("新待办事项")}
        />
        <button
          type="submit"
          className="demo-icon-btn"
          title={t("添加")}
          aria-label={t("添加")}
          disabled={!draft.trim()}
        >
          <span className="codicon codicon-add" />
        </button>
      </form>
      <ul className="demo-todo-list">
        {todos.map((x) => (
          <li key={x.id} className={`demo-todo-item${x.done ? " done" : ""}`}>
            <button
              type="button"
              className="demo-todo-check"
              title={x.done ? t("标记为未完成") : t("标记为已完成")}
              aria-label={x.done ? t("标记为未完成") : t("标记为已完成")}
              onClick={() => toggle(x.id)}
            >
              {x.done && <span className="codicon codicon-check" />}
            </button>
            <span className="demo-todo-text">{x.text}</span>
            <button
              type="button"
              className="demo-icon-btn demo-todo-remove"
              title={t("删除")}
              aria-label={t("删除")}
              onClick={() => remove(x.id)}
            >
              <span className="codicon codicon-close" />
            </button>
          </li>
        ))}
      </ul>
      {todos.length === 0 ? (
        <p className="demo-todo-empty">{t("暂无待办——添加一条试试")}</p>
      ) : (
        <div className="demo-todo-footer">
          {t("{{done}}/{{total}} 项已完成", { done: doneCount, total: todos.length })}
        </div>
      )}
    </div>
  );
}
