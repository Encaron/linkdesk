/*
 * oled_draw_test.c
 *
 *  Author: FengYiLi
 * Description: Serial Monitor V2 绘图协议测试模块
 *              接收 [draw,type,...] 命令 → 解析 → OLED 绘图
 *
 * 关键：DrawTest_ProcessCommand 先把 "draw," 前缀跳过，
 *       所以传入各 handler 的 cmd 以 type 开头（field 0 = type）。
 *       各 handler 中 field 1 才是第一个参数。
 *
 * 协议格式参考 Docs/MCU/OLED绘图协议.md
 */

#include "oled_draw_test.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

/* ===== 内部状态 ===== */
static uint32_t cmd_count;
static uint8_t  oled_inited;

/* ===== F5 增量同步：本地图形数组 ===== */
#define F5_MAX_SHAPES 32
static char   f5_ids[F5_MAX_SHAPES][8];
static char   f5_cmds[F5_MAX_SHAPES][256];
static uint8_t f5_count;

static int f5_find(const char *id) {
    for (int i = 0; i < f5_count; i++)
        if (strcmp(f5_ids[i], id) == 0) return i;
    return -1;
}

void DrawTest_ProcessCommand(const char *cmd);  // 前向声明

static void f5_redraw_all(void) {
    OLED_Clear();
    char buf[280];
    for (int i = 0; i < f5_count; i++) {
        snprintf(buf, sizeof(buf), "draw,%s", f5_cmds[i]);
        DrawTest_ProcessCommand(buf);
    }
    OLED_Update();
}

/* ===== GetField ===== */

int GetField(const char *src, char *dst, int field, int max_len)
{
    int fi = 0, di = 0;
    const char *p = src;
    if (!src || !dst || max_len <= 0) return -1;
    while (fi < field && *p) {
        if (*p == ',') fi++;
        p++;
    }
    if (fi < field) return -1;
    while (*p && *p != ',' && di < max_len - 1) {
        dst[di++] = *p++;
    }
    dst[di] = '\0';
    return 0;
}

/* ===== 辅助 ===== */

static int IsFillFlag(const char *s) {
    return (s && strcmp(s, "fill") == 0);
}

static int ParseInt(const char *s, int def) {
    if (!s || !*s) return def;
    return atoi(s);
}

/* ====== 各绘图 handler ======
 *
 * cmd 格式（已跳过 "draw," 前缀）：
 *   point:         point,x,y,#color                         field 1=x, 2=y
 *   line:          line,x1,y1,x2,y2,#color,w                field 1..4
 *   rect:          rect,x,y,w,h,#color[,w][,fill]           field 1..4; fill@6 or 7
 *   rrect:         rrect,x,y,w,h,#color,w,radius[,fill]     field 1..4; lw@6 radius@7 fill@8 (固定)
 *   circle:        circle,cx,cy,r,#color[,w][,fill]         field 1..3; fill@5 or 6
 *   ellipse:       ellipse,cx,cy,a,b,#color[,w][,fill]      field 1..4; fill@6 or 7
 *   triangle:      triangle,x0,y0,x1,y1,x2,y2,#color[,w][,fill] field 1..6; fill@8 or 9
 *   arc:           arc,cx,cy,r,start,end,#color[,w][,fill]  field 1..5; fill@7 or 8
 *   text:          text,x,y,content,fontSize,#color          field 1..4
 *   clear:         clear                                     (no params)
 *
 *   ⚠️ fill 字段位置因 lw 是否省略而变化，handler 内对两处都试读（如 field 5|6）
 */

static void Handle_Point(const char *cmd)
{
    char b[16];
    GetField(cmd, b, 1, sizeof(b)); int x = ParseInt(b, 0);
    GetField(cmd, b, 2, sizeof(b)); int y = ParseInt(b, 0);
    OLED_DrawPoint(x, y);
    OLED_UpdateArea(x, y, 1, 1);
}

static void Handle_Line(const char *cmd)
{
    char b[16];
    GetField(cmd, b, 1, sizeof(b)); int x0 = ParseInt(b, 0);
    GetField(cmd, b, 2, sizeof(b)); int y0 = ParseInt(b, 0);
    GetField(cmd, b, 3, sizeof(b)); int x1 = ParseInt(b, 0);
    GetField(cmd, b, 4, sizeof(b)); int y1 = ParseInt(b, 0);
    OLED_DrawLine(x0, y0, x1, y1);
    int xmin = x0 < x1 ? x0 : x1, xmax = x0 > x1 ? x0 : x1;
    int ymin = y0 < y1 ? y0 : y1, ymax = y0 > y1 ? y0 : y1;
    int w = xmax - xmin + 1, h = ymax - ymin + 1;
    if (w < 1) w = 1; if (h < 1) h = 1;
    OLED_UpdateArea(xmin, ymin, (uint8_t)w, (uint8_t)h);
}

static void Handle_ClearLine(const char *cmd)
{
    char b[16];
    GetField(cmd, b, 1, sizeof(b)); int x0 = ParseInt(b, 0);
    GetField(cmd, b, 2, sizeof(b)); int y0 = ParseInt(b, 0);
    GetField(cmd, b, 3, sizeof(b)); int x1 = ParseInt(b, 0);
    GetField(cmd, b, 4, sizeof(b)); int y1 = ParseInt(b, 0);
    OLED_ClearLine(x0, y0, x1, y1);
    int xmin = x0 < x1 ? x0 : x1, xmax = x0 > x1 ? x0 : x1;
    int ymin = y0 < y1 ? y0 : y1, ymax = y0 > y1 ? y0 : y1;
    int w = xmax - xmin + 1, h = ymax - ymin + 1;
    if (w < 1) w = 1; if (h < 1) h = 1;
    OLED_UpdateArea(xmin, ymin, (uint8_t)w, (uint8_t)h);
}

static void Handle_Rect(const char *cmd)
{
    char b[16];
    GetField(cmd, b, 1, sizeof(b)); int x = ParseInt(b, 0);
    GetField(cmd, b, 2, sizeof(b)); int y = ParseInt(b, 0);
    GetField(cmd, b, 3, sizeof(b)); int w = ParseInt(b, 0);
    GetField(cmd, b, 4, sizeof(b)); int h = ParseInt(b, 0);
    /* fill: lw=1时在field 6, lw>1时在field 7 → 两处都试 */
    char f[8]; uint8_t filled = OLED_UNFILLED;
    if ((GetField(cmd, f, 6, sizeof(f)) == 0 && IsFillFlag(f)) ||
        (GetField(cmd, f, 7, sizeof(f)) == 0 && IsFillFlag(f)))
        filled = OLED_FILLED;

    /* 检测旋转角度（末尾字段以 'a' 开头，如 a45） */
    const char *p = cmd, *last = cmd;
    while (*p) { if (*p == ',') last = p + 1; p++; }
    int angle = (last[0] == 'a') ? ParseInt(last + 1, 0) : 0;

    if (w < 1) w = 1; if (h < 1) h = 1;

    if (angle != 0) {
        OLED_DrawRotatedRect(x, y, (uint8_t)w, (uint8_t)h, (int16_t)angle, filled);
        OLED_Update();
    } else {
        OLED_DrawRectangle(x, y, (uint8_t)w, (uint8_t)h, filled);
        OLED_UpdateArea(x, y, (uint8_t)w, (uint8_t)h);
    }
}

static void Handle_RoundedRect(const char *cmd)
{
    char b[16];
    GetField(cmd, b, 1, sizeof(b)); int x      = ParseInt(b, 0);
    GetField(cmd, b, 2, sizeof(b)); int y      = ParseInt(b, 0);
    GetField(cmd, b, 3, sizeof(b)); int w      = ParseInt(b, 0);
    GetField(cmd, b, 4, sizeof(b)); int h      = ParseInt(b, 0);
    /* rrect: field 6=#color, 7=w, 8=radius → 但跳过"draw,"后 radius 在 field 7 */
    GetField(cmd, b, 7, sizeof(b)); int radius = ParseInt(b, 3);
    /* fill 在 field 8 */
    char f[8]; uint8_t filled = OLED_UNFILLED;
    if (GetField(cmd, f, 8, sizeof(f)) == 0 && IsFillFlag(f)) filled = OLED_FILLED;

    /* 旋转圆角矩形 → 忽略圆角 */
    const char *p2 = cmd, *last2 = cmd;
    while (*p2) { if (*p2 == ',') last2 = p2 + 1; p2++; }
    int rrangle = (last2[0] == 'a') ? ParseInt(last2 + 1, 0) : 0;
    if (rrangle != 0) {
        if (w < 1) w = 1; if (h < 1) h = 1;
        OLED_DrawRotatedRect(x, y, (uint8_t)w, (uint8_t)h, (int16_t)rrangle, filled);
        OLED_Update();
        return;
    }

    if (w < 1) w = 1; if (h < 1) h = 1; if (radius < 0) radius = 0;
    OLED_DrawRoundedRect(x, y, (uint8_t)w, (uint8_t)h, (uint8_t)radius, filled);
    OLED_UpdateArea(x, y, (uint8_t)w, (uint8_t)h);
}

static void Handle_Circle(const char *cmd)
{
    char b[16];
    GetField(cmd, b, 1, sizeof(b)); int cx = ParseInt(b, 0);
    GetField(cmd, b, 2, sizeof(b)); int cy = ParseInt(b, 0);
    GetField(cmd, b, 3, sizeof(b)); int r  = ParseInt(b, 0);
    /* fill: lw=1时在field 5, lw>1时在field 6 → 两处都试 */
    char f[8]; uint8_t filled = OLED_UNFILLED;
    if ((GetField(cmd, f, 5, sizeof(f)) == 0 && IsFillFlag(f)) ||
        (GetField(cmd, f, 6, sizeof(f)) == 0 && IsFillFlag(f)))
        filled = OLED_FILLED;
    if (r < 1) r = 1;
    OLED_DrawCircle(cx, cy, (uint8_t)r, filled);
    OLED_UpdateArea(cx - r, cy - r, (uint8_t)(r * 2 + 1), (uint8_t)(r * 2 + 1));
}

static void Handle_Ellipse(const char *cmd)
{
    char b[16];
    GetField(cmd, b, 1, sizeof(b)); int cx = ParseInt(b, 0);
    GetField(cmd, b, 2, sizeof(b)); int cy = ParseInt(b, 0);
    GetField(cmd, b, 3, sizeof(b)); int a  = ParseInt(b, 0);
    GetField(cmd, b, 4, sizeof(b)); int b_ = ParseInt(b, 0);
    /* fill: lw=1时在field 6, lw>1时在field 7 → 两处都试 */
    char f[8]; uint8_t filled = OLED_UNFILLED;
    if ((GetField(cmd, f, 6, sizeof(f)) == 0 && IsFillFlag(f)) ||
        (GetField(cmd, f, 7, sizeof(f)) == 0 && IsFillFlag(f)))
        filled = OLED_FILLED;

    // 旋转椭圆
    const char *pe = cmd, *laste = cmd;
    while (*pe) { if (*pe == ',') laste = pe + 1; pe++; }
    int ellAngle = (laste[0] == 'a') ? ParseInt(laste + 1, 0) : 0;

    if (a < 1) a = 1; if (b_ < 1) b_ = 1;

    if (ellAngle != 0) {
        OLED_DrawRotatedEllipse(cx, cy, (uint8_t)a, (uint8_t)b_, (int16_t)ellAngle, filled);
        OLED_UpdateArea(cx - a - 1, cy - b_ - 1, (uint8_t)(a * 2 + 3), (uint8_t)(b_ * 2 + 3));
    } else {
        OLED_DrawEllipse(cx, cy, (uint8_t)a, (uint8_t)b_, filled);
        OLED_UpdateArea(cx - a, cy - b_, (uint8_t)(a * 2 + 1), (uint8_t)(b_ * 2 + 1));
    }
}

static void Handle_Triangle(const char *cmd)
{
    char b[16];
    GetField(cmd, b, 1, sizeof(b)); int x0 = ParseInt(b, 0);
    GetField(cmd, b, 2, sizeof(b)); int y0 = ParseInt(b, 0);
    GetField(cmd, b, 3, sizeof(b)); int x1 = ParseInt(b, 0);
    GetField(cmd, b, 4, sizeof(b)); int y1 = ParseInt(b, 0);
    GetField(cmd, b, 5, sizeof(b)); int x2 = ParseInt(b, 0);
    GetField(cmd, b, 6, sizeof(b)); int y2 = ParseInt(b, 0);
    /* fill: lw=1时在field 8, lw>1时在field 9 → 两处都试 */
    char f[8]; uint8_t filled = OLED_UNFILLED;
    if ((GetField(cmd, f, 8, sizeof(f)) == 0 && IsFillFlag(f)) ||
        (GetField(cmd, f, 9, sizeof(f)) == 0 && IsFillFlag(f)))
        filled = OLED_FILLED;
    OLED_DrawTriangle(x0, y0, x1, y1, x2, y2, filled);
    int xmin = x0 < x1 ? x0 : x1; xmin = xmin < x2 ? xmin : x2;
    int xmax = x0 > x1 ? x0 : x1; xmax = xmax > x2 ? xmax : x2;
    int ymin = y0 < y1 ? y0 : y1; ymin = ymin < y2 ? ymin : y2;
    int ymax = y0 > y1 ? y0 : y1; ymax = ymax > y2 ? ymax : y2;
    OLED_UpdateArea(xmin, ymin, (uint8_t)(xmax - xmin + 1), (uint8_t)(ymax - ymin + 1));
}

static void Handle_Arc(const char *cmd)
{
    char b[16];
    GetField(cmd, b, 1, sizeof(b)); int cx        = ParseInt(b, 0);
    GetField(cmd, b, 2, sizeof(b)); int cy        = ParseInt(b, 0);
    GetField(cmd, b, 3, sizeof(b)); int r         = ParseInt(b, 0);
    GetField(cmd, b, 4, sizeof(b)); int startAng  = ParseInt(b, 0);
    GetField(cmd, b, 5, sizeof(b)); int endAng    = ParseInt(b, 0);
    /* fill: lw=1时在field 7, lw>1时在field 8 → 两处都试 */
    char f[8]; uint8_t filled = OLED_UNFILLED;
    if ((GetField(cmd, f, 7, sizeof(f)) == 0 && IsFillFlag(f)) ||
        (GetField(cmd, f, 8, sizeof(f)) == 0 && IsFillFlag(f)))
        filled = OLED_FILLED;
    if (r < 1) r = 1;
    OLED_DrawArc(cx, cy, (uint8_t)r, (int16_t)startAng, (int16_t)endAng, filled);
    OLED_UpdateArea(cx - r, cy - r, (uint8_t)(r * 2 + 1), (uint8_t)(r * 2 + 1));
}

static void Handle_Text(const char *cmd)
{
    char bx[16], by[16], content[128], bsize[8];
    GetField(cmd, bx,      1, sizeof(bx));
    GetField(cmd, by,      2, sizeof(by));
    GetField(cmd, content, 3, sizeof(content));
    GetField(cmd, bsize,   4, sizeof(bsize));
    int x = ParseInt(bx, 0);
    int y = ParseInt(by, 0);
    int fontSize = ParseInt(bsize, 16);
    /* 字号映射：PC 24→OLED_8X16, 12以下→OLED_6X8 */
    uint8_t f = (fontSize <= 12) ? OLED_6X8 : OLED_8X16;
    OLED_ShowString(x, y, content, f);
    int cw = (f == OLED_8X16) ? 8 : 6, ch = (f == OLED_8X16) ? 16 : 8;
    int tw = (int)strlen(content) * cw;
    if (tw > 128 - x) tw = 128 - x;
    OLED_UpdateArea(x, y, (uint8_t)tw, (uint8_t)ch);
}

static void Handle_Clear(const char *cmd)
{
    (void)cmd;
    f5_count = 0;        // F5: 清空图形数组
    OLED_Clear();
    OLED_Update();
}

/* ===== F5 增量同步：set / del handler ===== */

static void Handle_Set(const char *cmd) {
    char id[8], type[16];
    if (GetField(cmd, id, 1, sizeof(id)) != 0) return;
    if (GetField(cmd, type, 2, sizeof(type)) != 0) return;

    const char *params = cmd;
    int commas = 0;
    while (*params && commas < 3) {
        if (*params == ',') commas++;
        params++;
    }

    char stored[256];
    snprintf(stored, sizeof(stored), "%s,%s", type, params);

    int idx = f5_find(id);
    if (idx < 0) {
        if (f5_count >= F5_MAX_SHAPES) return;
        idx = f5_count++;
    }
    strcpy(f5_ids[idx], id);
    strcpy(f5_cmds[idx], stored);

    f5_redraw_all();
}

static void Handle_Del(const char *cmd) {
    char id[8];
    if (GetField(cmd, id, 1, sizeof(id)) != 0) return;

    int idx = f5_find(id);
    if (idx < 0) return;

    for (int i = idx; i < f5_count - 1; i++) {
        strcpy(f5_ids[i], f5_ids[i + 1]);
        strcpy(f5_cmds[i], f5_cmds[i + 1]);
    }
    f5_count--;

    f5_redraw_all();
}

/* ===== 颜色辅助 ===== */

static int IsEraserColor(const char *cmd)
{
    const char *p = cmd;
    while (*p) {
        if (*p == '#' && (p == cmd || *(p-1) == ',')) {
            if (strncmp(p, "#111111", 7) == 0 ||
                strncmp(p, "#000000", 7) == 0 ||
                strncmp(p, "#1a1a1a", 7) == 0 ||
                strncmp(p, "#0a0a0a", 7) == 0)
                return 1;
            /* 其他暗灰色 #1xxxxx, #2xxxxx 也算擦除 */
            if (p[1] == '1' && p[2] == '1' && p[3] == '1') return 1;
            if (p[1] == '2' && p[2] == '2' && p[3] == '2') return 1;
            if (p[1] == '0' && p[2] == '0' && p[3] == '0') return 1;
            break;
        }
        p++;
    }
    return 0;
}

/* ===== 命令分发 ===== */

void DrawTest_ProcessCommand(const char *cmd)
{
    /* 跳过 "draw," 前缀 —— 此后 field 0 = type */
    if (strncmp(cmd, "draw,", 5) == 0)
        cmd += 5;

    char type[16];
    if (GetField(cmd, type, 0, sizeof(type)) != 0) return;

    /* 橡皮擦颜色 → line 用 ClearLine 擦除，其他形状跳过 */
    int erasing = IsEraserColor(cmd);

    cmd_count++;

    if      (strcmp(type, "set")      == 0) Handle_Set(cmd);
    else if (strcmp(type, "del")      == 0) Handle_Del(cmd);
    else if (strcmp(type, "point")    == 0) { if (!erasing) Handle_Point(cmd); }
    else if (strcmp(type, "line")     == 0) {
        if (erasing) Handle_ClearLine(cmd);
        else         Handle_Line(cmd);
    }
    else if (strcmp(type, "rect")     == 0) { if (!erasing) Handle_Rect(cmd); }
    else if (strcmp(type, "rrect")    == 0) { if (!erasing) Handle_RoundedRect(cmd); }
    else if (strcmp(type, "circle")   == 0) { if (!erasing) Handle_Circle(cmd); }
    else if (strcmp(type, "ellipse")  == 0) { if (!erasing) Handle_Ellipse(cmd); }
    else if (strcmp(type, "triangle") == 0) { if (!erasing) Handle_Triangle(cmd); }
    else if (strcmp(type, "arc")      == 0) { if (!erasing) Handle_Arc(cmd); }
    else if (strcmp(type, "text")     == 0) { if (!erasing) Handle_Text(cmd); }
    else if (strcmp(type, "clear")    == 0) Handle_Clear(cmd);
}

/* ===== 主循环 ===== */

void DrawTest_Init(void)
{
    cmd_count = 0;
    if (!oled_inited) { OLED_Init(); oled_inited = 1; }
    OLED_Clear();
    OLED_Update();
    OLED_ShowString(0, 0,  "Draw Test Ready", OLED_6X8);
    OLED_ShowString(0, 16, "115200 8N1",      OLED_6X8);
    OLED_Update();

    UART_InitReceive(Serial_PC, SERIAL_PROTOCOL, SERIAL_SQUARE_BRACKET);
    UART_InitReceive(Serial_BT, SERIAL_PROTOCOL, SERIAL_SQUARE_BRACKET);

    printf("[system,draw_test_ready]\r\n");
}

void DrawTest_Handle(void)
{
    if (UART_GetRxFlag(Serial_PC)) {
        char *data = UART_GetRxData(Serial_PC);
        if (data && *data) {
            printf("[echo,%s]\r\n", data);
            DrawTest_ProcessCommand(data);
        }
    }
    if (UART_GetRxFlag(Serial_BT)) {
        char *data = UART_GetRxData(Serial_BT);
        if (data && *data) {
            Serial_Printf(&huart1, "[bt,%s]\r\n", data);
            DrawTest_ProcessCommand(data);
        }
    }
}
