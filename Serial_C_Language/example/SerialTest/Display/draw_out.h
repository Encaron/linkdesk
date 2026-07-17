/*
 * draw_out.h — F4 移植版 (原名 test_draw.h)
 *
 * OLED 绘图数据发生器（MCU→PC 方向）
 * 将 [draw,...] 协议指令通过串口发送给 PC 端渲染
 *
 * 注意：此模块是 MCU→PC 的画布数据发生器，
 * 与 DrawTest/oled_draw_test.c（PC→MCU 指令解析器）方向相反、功能不重叠。
 *
 *   OLED_Draw_Test()    — 静态画布（验证全部 9 条 draw 指令）
 *   Test_RadarInit()    — 雷达扫描线底盘（Init 一次）
 *   Test_RadarLoop()    — 雷达扫描线旋转（每 50ms）
 */
#ifndef DRAW_OUT_H_
#define DRAW_OUT_H_

void OLED_Draw_Test(void);
void Test_RadarInit(void);
void Test_RadarLoop(void);

#endif /* DRAW_OUT_H_ */
