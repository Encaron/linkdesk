/*
 * test_display.c
 *
 * OLED 虚拟屏 800×480 黑色底板
 *   - 启动画面 + UI 组件库 + 动态刷新
 *
 * 布局约束: X:0~800  Y:0~480
 *   字号参考: 28→~36px  16→~22px  14→~18px  12→~16px
 */

#include "test_display.h"
#include <math.h>
#include <stdio.h>

/* ── 共享缓冲区 ── */
static char dbuf[256];

/* ═══════════════════════════════════════════════════════════════
 *  UI 组件
 * ═══════════════════════════════════════════════════════════════ */

void Display_Divider(int y)
{
    Log("[display,20,%d,\"----------------------------------------"
        "----------------------------------------\",14,#333333]\r\n", y);
}

void Display_Value(int x, int y, const char *label, float val,
                   const char *unit, const char *color)
{
    Log("[display,%d,%d,\"%s %+08.2f %s  \",16,%s]\r\n",
        x, y, label, val, unit, color);
}

void Display_ProgressBar(int x, int y, int w, float pct, const char *color)
{
    int filled = (int)((float)w * pct / 100.0f + 0.5f);
    if (filled > w) filled = w;
    if (filled < 0) filled = 0;

    int pos = 0;
    for (int i = 0; i < filled; i++)  dbuf[pos++] = '#';
    for (int i = filled; i < w; i++)  dbuf[pos++] = '.';
    pos += snprintf(dbuf + pos, sizeof(dbuf) - pos, " %3.0f%%  ", pct);
    dbuf[pos] = '\0';

    Log("[display,%d,%d,\"%s\",16,%s]\r\n", x, y, dbuf, color);
}

void Display_StatusRow(int x, int y, const char *label, const char *value, int ok)
{
    Log("[display,%d,%d,\"%s\",16,#00AAFF]\r\n", x, y, label);
    Log("[display,%d,%d,\"%s\",16,#CCCCCC]\r\n", x + 130, y, value);
    Log("[display,%d,%d,\"%s\",16,%s]\r\n",
        x + 640, y, ok ? "●" : "!!", ok ? "#00FF00" : "#FF0000");
}

void Display_Alert(const char *text, const char *color)
{
    Log("[display-clear]\r\n");
    Log("[display,130,180,\"%s\",36,%s]\r\n", text, color);
    Log("[display,220,250,\"---- press reset ----\",14,#666666]\r\n");
}

void Display_BarChart(int x, int y, int bar_w, int max_h,
                      const float *vals, const char **labels, int n)
{
    float max_val = vals[0];
    for (int i = 1; i < n; i++)
        if (vals[i] > max_val) max_val = vals[i];
    if (max_val <= 0.0f) max_val = 1.0f;

    int gap   = (n <= 4) ? 4 : 2;
    int step  = bar_w + gap;
    int row_h = 15;   /* size=12 行高 */

    /* 柱体，从上往下画 */
    for (int row = max_h - 1; row >= 0; row--) {
        float thresh = (float)(row + 1) / (float)max_h * max_val;
        int pos = 0;
        for (int b = 0; b < n && pos < (int)sizeof(dbuf) - 4; b++) {
            if (vals[b] >= thresh) {
                for (int c = 0; c < bar_w; c++) dbuf[pos++] = '#';
            } else {
                for (int c = 0; c < bar_w; c++) dbuf[pos++] = ' ';
            }
            for (int c = 0; c < gap; c++) dbuf[pos++] = ' ';
        }
        dbuf[pos] = '\0';
        int row_y = y - (max_h - row) * row_h;
        Log("[display,%d,%d,\"%s\",12,#00AAFF]\r\n", x, row_y, dbuf);
    }

    /* 底部标签 */
    {
        int pos = 0;
        for (int b = 0; b < n && pos < (int)sizeof(dbuf) - 4; b++) {
            int len = (int)strlen(labels[b]);
            int pad = (step - len) / 2;
            if (pad < 0) pad = 0;
            for (int c = 0; c < pad; c++) dbuf[pos++] = ' ';
            for (int c = 0; c < len; c++) dbuf[pos++] = labels[b][c];
            for (int c = pad + len; c < step; c++) dbuf[pos++] = ' ';
        }
        dbuf[pos] = '\0';
        Log("[display,%d,%d,\"%s\",12,#888888]\r\n", x, y + 4, dbuf);
    }
}

/* ═══════════════════════════════════════════════════════════════
 *  启动画面   Y 范围: 5 ~ 395
 * ═══════════════════════════════════════════════════════════════ */

void Test_DisplayInit(void)
{
    Log("[display-clear]\r\n");

    /* ── 标题  y:5~70 ── */
    Log("[display,180,5,\"F4 SERIAL TEST\",28,#00FFFF]\r\n");
    Log("[display,230,42,\"800 x 480  OLED\",16,#888888]\r\n");
    Display_Divider(72);

    /* ── 状态面板  y:85~215 ── */
    Display_StatusRow(30,  88, "[ SERIAL  ]", "USART1 @ 115200 bps",    1);
    Display_StatusRow(30, 114, "[ PWM1    ]", "TIM6  SW 100Hz / PC13",  1);
    Display_StatusRow(30, 138, "[ PWM2    ]", "TIM11 HW 1kHz  / PF7",   1);
    Display_StatusRow(30, 140, "[ KEY     ]", "[key, btn, on/off]",     1);
    Display_StatusRow(30, 186, "[ SLIDER  ]", "S1→PC13 S2→PF7 0~100",  1);
    Display_StatusRow(30, 192, "[ DISPLAY ]", "Virtual OLED 800x480",   1);

    Display_Divider(220);

    /* ── 演示区: 左=进度条  右=柱状图  y:235~345 ── */
    Display_ProgressBar(30, 240, 36, 100.0f, "#00FF00");
    Display_ProgressBar(30, 268, 36,  75.0f, "#FFAA00");
    Display_ProgressBar(30, 296, 36,  40.0f, "#FF4444");

    {
        float  vals[]   = { 80, 45, 92, 33, 67 };
        const char *lbl[] = { "CH1","CH2","CH3","CH4","CH5" };
        Display_BarChart(470, 330, 3, 6, vals, lbl, 5);
    }

    Display_Divider(345);

    /* ── 就绪  y:360~395 ── */
    Log("[display,260,365,\"SYSTEM READY\",28,#00FF00]\r\n");
}

/* ═══════════════════════════════════════════════════════════════
 *  协议处理
 * ═══════════════════════════════════════════════════════════════ */

void Test_DisplayProcess(const char *raw)
{
    if (!raw || raw[0] == '\0') return;

    if (strcmp(raw, "display-clear") == 0) {
        Test_DisplayInit();
        return;
    }

    char type[16];
    GetField(raw, type, 0, sizeof(type));

    /* [display,...] 透传 */
    if (strcmp(type, "display") == 0) {
        Log("[%s]\r\n", raw);
    }

    /* [alert,text] 告警横幅 */
    if (strcmp(type, "alert") == 0) {
        char text[64];
        GetField(raw, text, 1, sizeof(text));
        Display_Alert(text, "#FF0000");
    }
}

/* ═══════════════════════════════════════════════════════════════
 *  动态刷新   Y 范围: 420~455（底部 25px 留白）
 * ═══════════════════════════════════════════════════════════════ */

void Test_DisplayLoop(void)
{
    static uint32_t tick    = 0;
    static uint32_t last_ms = 0;

    uint32_t now = HAL_GetTick();
    if (now - last_ms < 500)
        return;
    last_ms = now;
    tick++;

    /* 底部单行三列: 左=计时  中=帧数  右=模拟值 */
    Display_Value(20, 435, "UPTIME", (float)tick / 2.0f, "s",  "#FFAA00");
    Display_Value(280, 435, "TICK",   (float)tick,          "",   "#888888");

    float val = 50.0f + 50.0f * sinf((float)tick * 0.2f);
    Display_Value(560, 435, "ANALOG", val,                  "",   "#FF8800");
}
