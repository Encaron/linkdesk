/**
 * @vitest-environment jsdom
 * StringListEditor 行内直添判重——E6#30c 门 B 回归（settings 行内加源不得放行官方其他形态 / 同身份重复）。
 * itemKey = urlSourceKey 时跨形态判重：locked 内置源的仓库主页形态 → 报重复（门 B 关死的关键）；
 * 作者源同 owner/repo 多形态 → 报重复；真正的新作者源 → 照常加入。
 * fixture 全虚构（硬约束 21）：mega-repo/plugin-source 虚拟内置源、owner-two/catalog-repo-b 虚拟作者源，
 * 文案用虚构英文替身（Alpha/Beta 惯例），不指向真实产品文案。
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import StringListEditor from "./StringListEditor";
import { urlSourceKey } from "./urlSourceKey";

afterEach(() => cleanup());

// 虚拟「内置」源——locked 形态（main 直链）；仓库主页形态与之同身份
const LOCKED_MAIN = "https://raw.githubusercontent.com/mega-repo/plugin-source/main/marketplace.json";
const LOCKED_REPO_PAGE = "https://github.com/mega-repo/plugin-source";
// 虚拟作者源——value 已有 main 直链；仓库主页形态与之同身份
const AUTHOR_MAIN = "https://raw.githubusercontent.com/owner-two/catalog-repo-b/main/marketplace.json";
const AUTHOR_REPO_PAGE = "https://github.com/owner-two/catalog-repo-b";
const DUP = "Already in the list.";
const ADD = "Add source";

function renderEditor(props: { value?: string[]; locked?: string[] }) {
  const onChange = vi.fn();
  const utils = render(
    <StringListEditor
      value={props.value ?? []}
      onChange={onChange}
      locked={props.locked ?? [LOCKED_MAIN]}
      addLabel={ADD}
      removeTitle="Remove row"
      urlOnly
      itemKey={urlSourceKey}
      placeholder="Paste a repo URL"
      duplicateMessage={DUP}
    />,
  );
  const input = utils.getByPlaceholderText("Paste a repo URL");
  return { onChange, input, ...utils };
}

describe("StringListEditor itemKey 判重（门 B）", () => {
  it("locked 内置源：行内直添其仓库主页形态 → 报重复、不加（同身份）", () => {
    const { onChange, input, getByText } = renderEditor({});
    fireEvent.change(input, { target: { value: LOCKED_REPO_PAGE } });
    fireEvent.click(getByText(ADD));
    expect(onChange).not.toHaveBeenCalled();
    expect(getByText(DUP)).toBeTruthy();
  });

  it("locked 内置源：行内直添其 HEAD 直链形态 → 报重复", () => {
    const { onChange, input, getByText } = renderEditor({});
    fireEvent.change(input, { target: { value: "https://raw.githubusercontent.com/mega-repo/plugin-source/HEAD/marketplace.json" } });
    fireEvent.click(getByText(ADD));
    expect(onChange).not.toHaveBeenCalled();
    expect(getByText(DUP)).toBeTruthy();
  });

  it("作者源同 owner/repo 多形态：value 已有 main 直链，直添仓库主页 → 报重复", () => {
    const { onChange, input, getByText } = renderEditor({ value: [AUTHOR_MAIN] });
    fireEvent.change(input, { target: { value: AUTHOR_REPO_PAGE } });
    fireEvent.click(getByText(ADD));
    expect(onChange).not.toHaveBeenCalled();
    expect(getByText(DUP)).toBeTruthy();
  });

  it("真正的新作者源（异身份）→ 照常加入", () => {
    const { onChange, input, getByText } = renderEditor({});
    fireEvent.change(input, { target: { value: AUTHOR_REPO_PAGE } });
    fireEvent.click(getByText(ADD));
    expect(onChange).toHaveBeenCalledWith([AUTHOR_REPO_PAGE]);
  });
});
