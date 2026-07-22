/**
 * V3 协议语法高亮 —— Monaco Monarch tokenizer。
 * [卡片ID, 值, ...] → ID 蓝色 / 数值绿色 / ! 定义粉色
 */
export const v3ProtocolLanguage = {
  tokenizer: {
    root: [
      // ! 卡片定义
      [/![\w_]+/, { token: "keyword", fontStyle: "bold" }],
      // 卡片 ID（方括号内第一个逗号前的词）
      [/(?<=\[)[\w_]+/, "type"],
      // 数值
      [/\b\d+\.?\d*\b/, "number"],
      // 字符串（引号包裹）
      [/"[^"]*"/, "string"],
      // on / off / down / up
      [/\b(on|off|down|up)\b/, "keyword"],
      // 方括号
      [/\[/, "delimiter.bracket"],
      [/\]/, "delimiter.bracket"],
      // 逗号
      [/,/, "delimiter"],
    ],
  },
};

export const v3ProtocolTheme = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "type", foreground: "569CD6", fontStyle: "bold" },
    { token: "keyword", foreground: "C586C0" },
    { token: "number", foreground: "6A9955" },
    { token: "string", foreground: "CE9178" },
    { token: "delimiter.bracket", foreground: "808080" },
    { token: "delimiter", foreground: "808080" },
  ],
  colors: {},
};
