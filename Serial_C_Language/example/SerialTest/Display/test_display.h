/*
 * test_display.h
 *
 * OLED 虚拟屏 800×480 黑色底板 测试模块
 *
 * 基础原语（PC 端渲染）:
 *   [display,x,y,"text",size]            → 显示文本
 *   [display,x,y,"text",size,#RRGGBB]    → 带颜色
 *   [display-clear]                      → 清屏
 *
 * UI 组件（MCU 端拼接）:
 *   Display_Divider(y)
 *   Display_Value(x, y, label, val, unit, color)
 *   Display_ProgressBar(x, y, w, pct, color)
 *   Display_BarChart(x, y, bar_w, max_h, vals, labels, n)
 *   Display_StatusRow(x, y, label, value, ok)
 *   Display_Alert(text, color)
 *
 * 用法:
 *   Test_DisplayInit();    // 启动画面（main 初始化区调用一次）
 *   Test_DisplayLoop();    // 动态刷新（main 循环中调用）
 */
#ifndef TEST_DISPLAY_H_
#define TEST_DISPLAY_H_

#include "../Protocols/test_protocols.h"

/* ── 测试入口 ── */
void Test_DisplayInit(void);
void Test_DisplayProcess(const char *raw);
void Test_DisplayLoop(void);

/* ── UI 组件 ── */
void Display_Divider(int y);
void Display_Value(int x, int y, const char *label, float val,
                   const char *unit, const char *color);
void Display_ProgressBar(int x, int y, int w, float pct, const char *color);
void Display_BarChart(int x, int y, int bar_w, int max_h,
                      const float *vals, const char **labels, int n);
void Display_StatusRow(int x, int y, const char *label, const char *value, int ok);
void Display_Alert(const char *text, const char *color);

#endif /* TEST_DISPLAY_H_ */
