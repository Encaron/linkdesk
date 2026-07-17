/*
 * test_waveform.h
 *
 * 波形发生器 —— 9 种测试波形，通过 [plot,ch,value] 协议输出
 * 用法:
 *   Test_WaveformInit(WAVEFORM_SIN);
 *   while (1) { Test_WaveformProcess(); HAL_Delay(50); }
 */
#ifndef TEST_WAVEFORM_H_
#define TEST_WAVEFORM_H_

/* ── 波形模式 ── */
#define WAVEFORM_SIN      0   // 正弦波
#define WAVEFORM_SQUARE   1   // 方波
#define WAVEFORM_TRI      2   // 三角波
#define WAVEFORM_SAW      3   // 锯齿波
#define WAVEFORM_AM       4   // AM调幅波
#define WAVEFORM_MIXED    5   // 基波+3次谐波
#define WAVEFORM_NOISE    6   // 正弦+噪声
#define WAVEFORM_DAMPED   7   // 衰减振荡
#define WAVEFORM_BURST    8   // 脉冲串

void Test_WaveformInit(int mode);
void Test_WaveformProcess(void);

#endif /* TEST_WAVEFORM_H_ */
