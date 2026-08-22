/**
 * splitTree 单元测试——递归分裂树数据结构。
 */

import { describe, it, expect } from "vitest";
import {
  treeDepth,
  getAllLeafGroupIds,
  leafCount,
  findParentInTree,
  findLeaf,
  replaceLeafWithBranch,
  replaceLeafGroupId,
  removeLeafFromTree,
  migrateLayout,
  validateTree,
  type SplitNode,
} from "./splitTree";

/* ── 测试夹具 ── */

// E5.7#98：分支/叶子窄类型——替代 (x as any) 直取联合专属字段
type BranchNode = Extract<SplitNode, { type: "branch" }>;
type LeafNode = Extract<SplitNode, { type: "leaf" }>;

const singleLeaf: SplitNode = { type: "leaf", groupId: "main" };

const twoPane: SplitNode = {
  type: "branch",
  direction: "horizontal",
  children: [
    { type: "leaf", groupId: "g1" },
    { type: "leaf", groupId: "g2" },
  ],
  sizes: [50, 50],
};

const threePane: SplitNode = {
  type: "branch",
  direction: "horizontal",
  children: [
    {
      type: "branch",
      direction: "vertical",
      children: [
        { type: "leaf", groupId: "g1" },
        { type: "leaf", groupId: "g2" },
      ],
      sizes: [50, 50],
    },
    { type: "leaf", groupId: "g3" },
  ],
  sizes: [67, 33],
};

/* ── treeDepth ── */

describe("treeDepth", () => {
  it("single leaf = depth 1", () => {
    expect(treeDepth(singleLeaf)).toBe(1);
  });

  it("two-pane = depth 2", () => {
    expect(treeDepth(twoPane as SplitNode)).toBe(2);
  });

  it("three-pane (左上下+右单) = depth 3", () => {
    expect(treeDepth(threePane as SplitNode)).toBe(3);
  });
});

/* ── getAllLeafGroupIds ── */

describe("getAllLeafGroupIds", () => {
  it("single leaf returns one id", () => {
    expect(getAllLeafGroupIds(singleLeaf)).toEqual(["main"]);
  });

  it("two-pane returns two ids in order", () => {
    expect(getAllLeafGroupIds(twoPane)).toEqual(["g1", "g2"]);
  });

  it("three-pane returns three ids in order", () => {
    expect(getAllLeafGroupIds(threePane)).toEqual(["g1", "g2", "g3"]);
  });
});

/* ── leafCount ── */

describe("leafCount", () => {
  it("counts correctly for each fixture", () => {
    expect(leafCount(singleLeaf)).toBe(1);
    expect(leafCount(twoPane)).toBe(2);
    expect(leafCount(threePane)).toBe(3);
  });
});

/* ── findParentInTree ── */

describe("findParentInTree", () => {
  it("single leaf has no parent", () => {
    expect(findParentInTree(singleLeaf, "main")).toBeNull();
  });

  it("two-pane: g1 parent is root branch, side 0", () => {
    const result = findParentInTree(twoPane, "g1");
    expect(result).not.toBeNull();
    expect(result!.side).toBe(0);
    expect(result!.parent.direction).toBe("horizontal");
  });

  it("two-pane: g2 parent is root branch, side 1", () => {
    const result = findParentInTree(twoPane, "g2");
    expect(result).not.toBeNull();
    expect(result!.side).toBe(1);
  });

  it("three-pane: g3 parent is root branch, side 1", () => {
    const result = findParentInTree(threePane, "g3");
    expect(result).not.toBeNull();
    expect(result!.side).toBe(1);
    expect(result!.parent.direction).toBe("horizontal");
  });

  it("non-existent groupId returns null", () => {
    expect(findParentInTree(twoPane, "nonexistent")).toBeNull();
  });
});

/* ── findLeaf ── */

describe("findLeaf", () => {
  it("finds leaf in single tree", () => {
    expect(findLeaf(singleLeaf, "main")).toEqual({ type: "leaf", groupId: "main" });
  });

  it("finds leaf in nested tree", () => {
    expect(findLeaf(threePane, "g2")).toEqual({ type: "leaf", groupId: "g2" });
  });

  it("returns null for non-existent groupId", () => {
    expect(findLeaf(twoPane, "g3")).toBeNull();
  });
});

/* ── replaceLeafWithBranch ── */

describe("replaceLeafWithBranch", () => {
  it("single leaf → two-pane horizontal", () => {
    const result = replaceLeafWithBranch(singleLeaf, "main", "horizontal", "new");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("branch");
    expect((result as BranchNode).direction).toBe("horizontal");
    expect(getAllLeafGroupIds(result!)).toEqual(["main", "new"]);
    expect((result as BranchNode).sizes).toEqual([50, 50]);
  });

  it("two-pane: split g2 vertically", () => {
    const result = replaceLeafWithBranch(twoPane, "g2", "vertical", "new");
    expect(result).not.toBeNull();
    expect(getAllLeafGroupIds(result!)).toEqual(["g1", "g2", "new"]);
    expect(treeDepth(result!)).toBe(3);
    // g2 and new should be vertical children
    const inner = (result as BranchNode).children[1] as BranchNode;
    expect(inner.type).toBe("branch");
    expect(inner.direction).toBe("vertical");
    expect((inner.children[0] as LeafNode).groupId).toBe("g2");
    expect((inner.children[1] as LeafNode).groupId).toBe("new");
  });

  it("non-existent targetGroupId returns null", () => {
    const result = replaceLeafWithBranch(twoPane, "nonexistent", "horizontal", "new");
    expect(result).toBeNull();
  });
});

/* ── replaceLeafGroupId ── */

describe("replaceLeafGroupId", () => {
  it("single leaf: replace groupId", () => {
    const result = replaceLeafGroupId(singleLeaf, "main", "newGroup");
    expect(result).toEqual({ type: "leaf", groupId: "newGroup" });
  });

  it("two-pane: replace g2 leaf groupId", () => {
    const result = replaceLeafGroupId(twoPane, "g2", "newGroup");
    expect(result).not.toBeNull();
    expect(getAllLeafGroupIds(result!)).toEqual(["g1", "newGroup"]);
  });

  it("non-existent groupId returns null", () => {
    const result = replaceLeafGroupId(twoPane, "nonexistent", "new");
    expect(result).toBeNull();
  });
});

/* ── removeLeafFromTree ── */

describe("removeLeafFromTree", () => {
  it("cannot remove single leaf", () => {
    expect(removeLeafFromTree(singleLeaf, "main")).toBeNull();
  });

  it("remove g1 from two-pane → g2 survives", () => {
    const result = removeLeafFromTree(twoPane, "g1");
    expect(result).not.toBeNull();
    expect(result!.tree.type).toBe("leaf");
    expect((result!.tree as LeafNode).groupId).toBe("g2");
    expect(result!.survivingSiblingGroupId).toBe("g2");
  });

  it("remove g2 from two-pane → g1 survives", () => {
    const result = removeLeafFromTree(twoPane, "g2");
    expect(result).not.toBeNull();
    expect((result!.tree as LeafNode).groupId).toBe("g1");
    expect(result!.survivingSiblingGroupId).toBe("g1");
  });

  it("remove g2 from three-pane → tree collapses to two-pane", () => {
    const result = removeLeafFromTree(threePane, "g2");
    expect(result).not.toBeNull();
    // g1 survives in place of the inner vertical branch
    expect(getAllLeafGroupIds(result!.tree)).toEqual(["g1", "g3"]);
    expect(result!.survivingSiblingGroupId).toBe("g1");
  });

  it("remove g3 from three-pane → left subtree survives", () => {
    const result = removeLeafFromTree(threePane, "g3");
    expect(result).not.toBeNull();
    // g1 and g2 remain as vertical branch
    expect(getAllLeafGroupIds(result!.tree)).toEqual(["g1", "g2"]);
    expect(result!.survivingSiblingGroupId).toBe("g1");
  });
});

/* ── migrateLayout ── */

describe("migrateLayout", () => {
  it("new format with root → returns root as-is", () => {
    const root: SplitNode = { type: "leaf", groupId: "test" };
    expect(migrateLayout({ root })).toBe(root);
  });

  it("old split format → two-pane branch", () => {
    const result = migrateLayout({
      split: { direction: "vertical", groupIds: ["a", "b"], sizes: [30, 70] },
    });
    expect(result.type).toBe("branch");
    expect((result as BranchNode).direction).toBe("vertical");
    expect(getAllLeafGroupIds(result)).toEqual(["a", "b"]);
    expect((result as BranchNode).sizes).toEqual([30, 70]);
  });

  it("no split no root → single leaf from groups[0]", () => {
    const result = migrateLayout({ groups: [{ id: "myGroup" }] });
    expect(result).toEqual({ type: "leaf", groupId: "myGroup" });
  });

  it("no groups → defaults to main", () => {
    const result = migrateLayout({});
    expect(result).toEqual({ type: "leaf", groupId: "main" });
  });
});

/* ── validateTree ── */

describe("validateTree", () => {
  it("valid single leaf", () => {
    const result = validateTree(singleLeaf, new Set(["main"]));
    expect(result.valid).toBe(true);
  });

  it("valid two-pane", () => {
    const result = validateTree(twoPane, new Set(["g1", "g2"]));
    expect(result.valid).toBe(true);
  });

  it("groupId not in groups set → invalid", () => {
    const result = validateTree(twoPane, new Set(["g1"]));
    expect(result.valid).toBe(false);
  });

  it("duplicate groupId → invalid", () => {
    const badTree: SplitNode = {
      type: "branch",
      direction: "horizontal",
      children: [
        { type: "leaf", groupId: "same" },
        { type: "leaf", groupId: "same" },
      ],
      sizes: [50, 50],
    };
    const result = validateTree(badTree, new Set(["same"]));
    expect(result.valid).toBe(false);
  });
});
