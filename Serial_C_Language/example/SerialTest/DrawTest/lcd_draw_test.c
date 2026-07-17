/*
 * lcd_draw_test.c
 *
 *  Author: FengYiLi
 * Description: Serial Monitor V2 LCD 绘图测试模块
 *              接收 [lcd,type,...] / [draw,type,...] 命令 → LCD 240x280 绘图
 *
 * 协议前缀: "lcd," 或 "draw,"（由 main.c 统一转换）
 * 颜色格式: #RRGGBB → RGB565
 * 支持: point / line / rect / rrect / circle / ellipse / triangle / arc / text / clear / fill
 */

#include "lcd_draw_test.h"
#include "../../HardWare/Serial/Serial.h"
#include "oled_draw_test.h"   /* GetField */
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include <math.h>

/* ===== 内部状态 ===== */
static uint32_t cmd_count;
static uint16_t _default_color = 0xFFFF; /* WHITE */

/* ===== F5 增量同步：本地图形数组 ===== */
#define F5_MAX_SHAPES 32
static char   f5_ids[F5_MAX_SHAPES][8];      // "a1","a2",...
static char   f5_cmds[F5_MAX_SHAPES][256];   // "circle,149,117,84,#FFFFFF,fill" (不含 "draw," 前缀)
static uint8_t f5_count;                     // 当前图形数
static uint16_t f5_bg = 0x0000;              // 背景色 (BLACK)

static int f5_find(const char *id) {
    for (int i = 0; i < f5_count; i++)
        if (strcmp(f5_ids[i], id) == 0) return i;
    return -1;
}

void LCD_DrawTest_ProcessCommand(const char *cmd);  // 前向声明

static void f5_redraw_all(void) {
    LCD_ClearFast(f5_bg);
    char buf[280];
    for (int i = 0; i < f5_count; i++) {
        snprintf(buf, sizeof(buf), "draw,%s", f5_cmds[i]);
        LCD_DrawTest_ProcessCommand(buf);
    }
}

/* ===== 辅助 ===== */

static int ParseInt(const char *s, int def) {
    if (!s || !*s) return def;
    return atoi(s);
}

static int IsFillFlag(const char *s) {
    return (s && strcmp(s, "fill") == 0);
}

static uint8_t HexNibble(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    return 0;
}

/* "#RRGGBB" → RGB565 */
static uint16_t ParseColor(const char *s) {
    if (!s || s[0] != '#') return _default_color;
    uint8_t r = (HexNibble(s[1]) << 4) | HexNibble(s[2]);
    uint8_t g = (HexNibble(s[3]) << 4) | HexNibble(s[4]);
    uint8_t b = (HexNibble(s[5]) << 4) | HexNibble(s[6]);
    return ((uint16_t)(r >> 3) << 11) | ((uint16_t)(g >> 2) << 5) | (b >> 3);
}

/* clamp 单坐标 */
static int16_t ClampX(int16_t x) { if (x < 0) return 0; if (x >= LCD_W) return LCD_W - 1; return x; }
static int16_t ClampY(int16_t y) { if (y < 0) return 0; if (y >= LCD_H) return LCD_H - 1; return y; }

/* 在 OLED_DisplayBuf 不可用时替代 memset 的模式 */
static void LCD_DrawHLine(int16_t x1, int16_t x2, int16_t y, uint16_t color) {
    if (y < 0 || y >= LCD_H) return;
    if (x1 > x2) { int16_t t = x1; x1 = x2; x2 = t; }
    if (x1 < 0) x1 = 0;
    if (x2 >= LCD_W) x2 = LCD_W - 1;
    if (x1 <= x2) LCD_Fill(x1, y, x2, y, color);
}

/* ===== 旋转矩形 ===== */
static void LCD_DrawFilledTriangle(int16_t x0, int16_t y0, int16_t x1, int16_t y1,
                                   int16_t x2, int16_t y2, uint16_t color);  // 前向声明
static void LCD_DrawRotatedRect(int16_t x, int16_t y, uint8_t w, uint8_t h,
                                 int16_t angle, uint16_t color, int filled, int lw) {
    if (w < 1 || h < 1) return;
    float rad = angle * 3.14159f / 180.0f;
    float cos_a = cosf(rad), sin_a = sinf(rad);
    float cx = x + w / 2.0f, cy = y + h / 2.0f;

    float corners[4][2] = {{x, y}, {x+w-1, y}, {x+w-1, y+h-1}, {x, y+h-1}};
    int16_t rx[4], ry[4];
    for (int i = 0; i < 4; i++) {
        float dx = corners[i][0] - cx, dy = corners[i][1] - cy;
        rx[i] = (int16_t)(cx + dx * cos_a - dy * sin_a);
        ry[i] = (int16_t)(cy + dx * sin_a + dy * cos_a);
    }

    if (filled) {
        LCD_DrawFilledTriangle(rx[0], ry[0], rx[1], ry[1], rx[2], ry[2], color);
        LCD_DrawFilledTriangle(rx[0], ry[0], rx[2], ry[2], rx[3], ry[3], color);
    } else {
        for (int i = 0; i < 4; i++) {
            int j = (i + 1) % 4;
            LCD_DrawLine(ClampX(rx[i]), ClampY(ry[i]), ClampX(rx[j]), ClampY(ry[j]), color);
        }
    }
    (void)lw; // OLED 单色忽略线宽，LCD 线宽固定
}

/* ===== 旋转椭圆 ===== */
static void LCD_DrawRotatedEllipse(int16_t cx, int16_t cy, uint8_t a, uint8_t b,
                                    int16_t angle, uint16_t color, int filled) {
    float rad = angle * 3.14159f / 180.0f;
    float cos_a = cosf(rad), sin_a = sinf(rad);

    if (filled) {
        int16_t rmax = (a > b ? a : b) + 1;
        for (int16_t y = cy - rmax; y <= cy + rmax; y++) {
            int16_t xmin = 9999, xmax = -9999;
            for (int16_t x = cx - rmax; x <= cx + rmax; x++) {
                float dx = x - cx, dy = y - cy;
                float rx = dx * cos_a + dy * sin_a;
                float ry = -dx * sin_a + dy * cos_a;
                if ((rx*rx)/(a*a) + (ry*ry)/(b*b) <= 1.0f) {
                    if (x < xmin) xmin = x;
                    if (x > xmax) xmax = x;
                }
            }
            if (xmin <= xmax)
                LCD_Fill(ClampX(xmin), ClampY(y), ClampX(xmax), ClampY(y), color);
        }
    } else {
        int16_t prev_x = 0, prev_y = 0;
        uint8_t first = 1;
        for (int t = 0; t <= 360; t += 5) {
            float trad = t * 3.14159f / 180.0f;
            float ex = a * cosf(trad), ey = b * sinf(trad);
            float rx = ex * cos_a - ey * sin_a;
            float ry = ex * sin_a + ey * cos_a;
            int16_t px = cx + (int16_t)rx, py = cy + (int16_t)ry;
            if (!first) LCD_DrawLine(ClampX(prev_x), ClampY(prev_y),
                                      ClampX(px), ClampY(py), color);
            prev_x = px; prev_y = py; first = 0;
        }
    }
}

/* ===== 填充圆形 ===== */
static void LCD_DrawFilledCircle(uint16_t cx, uint16_t cy, uint8_t r, uint16_t color) {
    int16_t x = r, y = 0;
    int16_t err = 1 - r;
    while (x >= y) {
        LCD_DrawHLine(cx - x, cx + x, cy - y, color);
        LCD_DrawHLine(cx - x, cx + x, cy + y, color);
        if (x != y) {
            LCD_DrawHLine(cx - y, cx + y, cy - x, color);
            LCD_DrawHLine(cx - y, cx + y, cy + x, color);
        }
        y++;
        if (err <= 0) { err += 2*y + 1; }
        else { x--; err += 2*(y - x) + 1; }
    }
}

/* ===== 填充椭圆（扫描线） ===== */
static void LCD_DrawFilledEllipse(int16_t cx, int16_t cy, int16_t a, int16_t b, uint16_t color) {
    if (a < 1 || b < 1) return;
    int32_t a2 = (int32_t)a * a, b2 = (int32_t)b * b;
    for (int16_t dy = -b; dy <= b; dy++) {
        int16_t sy = cy + dy;
        if (sy < 0 || sy >= LCD_H) continue;
        /* x = a * sqrt(1 - dy^2/b^2) */
        int16_t dx = (int16_t)(a * sqrtf(1.0f - (float)(dy * dy) / (float)b2));
        LCD_DrawHLine(cx - dx, cx + dx, sy, color);
    }
}

/* ===== 填充三角形（扫描线） ===== */
static void LCD_DrawFilledTriangle(int16_t x0, int16_t y0, int16_t x1, int16_t y1,
                                   int16_t x2, int16_t y2, uint16_t color) {
    int16_t miny = y0, maxy = y0;
    if (y1 < miny) miny = y1; if (y2 < miny) miny = y2;
    if (y1 > maxy) maxy = y1; if (y2 > maxy) maxy = y2;
    if (miny < 0) miny = 0;
    if (maxy >= LCD_H) maxy = LCD_H - 1;

    for (int16_t y = miny; y <= maxy; y++) {
        int16_t xs[6]; int n = 0;
        #define INTERSECT(xa, ya, xb, yb) do { \
            if ((ya <= y && yb > y) || (yb <= y && ya > y)) { \
                xs[n++] = xa + (int16_t)((int32_t)(xb - xa) * (y - ya) / (yb - ya)); \
            } \
        } while(0)
        INTERSECT(x0, y0, x1, y1);
        INTERSECT(x1, y1, x2, y2);
        INTERSECT(x2, y2, x0, y0);
        #undef INTERSECT
        if (n >= 2) {
            if (xs[0] > xs[1]) { int16_t t = xs[0]; xs[0] = xs[1]; xs[1] = t; }
            LCD_DrawHLine(xs[0], xs[1], y, color);
        }
    }
}

/* ===== 各绘图 handler =====
 *
 * cmd 格式（已跳过 "lcd," / "draw," 前缀, field 0 = type）:
 *   point:    point,x,y,#RRGGBB                           field 1=x, 2=y
 *   line:     line,x1,y1,x2,y2,#RRGGBB,w                  field 1..4
 *   rect:     rect,x,y,w,h,#RRGGBB[,w][,fill]             field 1..4; fill@6|7
 *   rrect:    rrect,x,y,w,h,#RRGGBB,w,radius[,fill]       field 1..4; lw@6 r@7 fill@8
 *   circle:   circle,cx,cy,r,#RRGGBB[,w][,fill]           field 1..3; fill@5|6
 *   ellipse:  ellipse,cx,cy,a,b,#RRGGBB[,w][,fill]        field 1..4; fill@6|7
 *   triangle: triangle,x0,y0,x1,y1,x2,y2,#RRGGBB[,w][,fill] 1..6; fill@8|9
 *   arc:      arc,cx,cy,r,start,end,#RRGGBB[,w][,fill]    field 1..5; fill@7|8
 *   text:     text,x,y,content,size,#RRGGBB               field 1..4
 *   clear:    clear[,#RRGGBB]
 *   fill:     fill,x,y,w,h,#RRGGBB
 */

static void Handle_LCD_Point(const char *cmd) {
    char b[16];
    GetField(cmd, b, 1, sizeof(b)); int x = ParseInt(b, 0);
    GetField(cmd, b, 2, sizeof(b)); int y = ParseInt(b, 0);
    char c[10]; GetField(cmd, c, 3, sizeof(c));
    uint16_t color = ParseColor(c);
    x = ClampX(x); y = ClampY(y);
    LCD_DrawPoint(x, y, color);
}

static void Handle_LCD_Line(const char *cmd) {
    char b[16];
    GetField(cmd, b, 1, sizeof(b)); int x1 = ParseInt(b, 0);
    GetField(cmd, b, 2, sizeof(b)); int y1 = ParseInt(b, 0);
    GetField(cmd, b, 3, sizeof(b)); int x2 = ParseInt(b, 0);
    GetField(cmd, b, 4, sizeof(b)); int y2 = ParseInt(b, 0);
    char c[10]; GetField(cmd, c, 5, sizeof(c));
    uint16_t color = ParseColor(c);
    x1 = ClampX(x1); y1 = ClampY(y1);
    x2 = ClampX(x2); y2 = ClampY(y2);
    LCD_DrawLine(x1, y1, x2, y2, color);
}

static void Handle_LCD_Rect(const char *cmd) {
    char b[16];
    GetField(cmd, b, 1, sizeof(b)); int x = ParseInt(b, 0);
    GetField(cmd, b, 2, sizeof(b)); int y = ParseInt(b, 0);
    GetField(cmd, b, 3, sizeof(b)); int w = ParseInt(b, 0);
    GetField(cmd, b, 4, sizeof(b)); int h = ParseInt(b, 0);
    char c[10]; GetField(cmd, c, 5, sizeof(c));
    uint16_t color = ParseColor(c);
    if (w < 1) w = 1; if (h < 1) h = 1;

    char f[8]; int filled = 0;
    if ((GetField(cmd, f, 6, sizeof(f)) == 0 && IsFillFlag(f)) ||
        (GetField(cmd, f, 7, sizeof(f)) == 0 && IsFillFlag(f)))
        filled = 1;

    // 检测旋转角度（末尾字段以 'a' 开头，如 a45）
    const char *p = cmd, *last = cmd;
    while (*p) { if (*p == ',') last = p + 1; p++; }
    int angle = (last[0] == 'a') ? ParseInt(last + 1, 0) : 0;

    if (angle != 0) {
        char lwb[8];
        int lw = 1;
        if (GetField(cmd, lwb, 6, sizeof(lwb)) == 0) lw = ParseInt(lwb, 1);
        LCD_DrawRotatedRect(x, y, (uint8_t)w, (uint8_t)h, (int16_t)angle, color, filled, lw);
        return;
    }

    int x2 = ClampX(x + w - 1), y2 = ClampY(y + h - 1);
    x = ClampX(x); y = ClampY(y);
    if (filled)
        LCD_Fill(x, y, x2, y2, color);
    else
        LCD_DrawRectangle(x, y, x2, y2, color);
}

static void Handle_LCD_RoundedRect(const char *cmd) {
    char b[16];
    GetField(cmd, b, 1, sizeof(b)); int x = ParseInt(b, 0);
    GetField(cmd, b, 2, sizeof(b)); int y = ParseInt(b, 0);
    GetField(cmd, b, 3, sizeof(b)); int w = ParseInt(b, 0);
    GetField(cmd, b, 4, sizeof(b)); int h = ParseInt(b, 0);
    char c[10]; GetField(cmd, c, 5, sizeof(c));
    uint16_t color = ParseColor(c);
    GetField(cmd, b, 7, sizeof(b)); int radius = ParseInt(b, 3);
    char f[8]; int filled = 0;
    if (GetField(cmd, f, 8, sizeof(f)) == 0 && IsFillFlag(f)) filled = 1;

    // 旋转圆角矩形 → 忽略圆角，按旋转矩形处理
    const char *p2 = cmd, *last2 = cmd;
    while (*p2) { if (*p2 == ',') last2 = p2 + 1; p2++; }
    int rrangle = (last2[0] == 'a') ? ParseInt(last2 + 1, 0) : 0;
    if (rrangle != 0) {
        char lwb[8]; int lw2 = 1;
        if (GetField(cmd, lwb, 6, sizeof(lwb)) == 0) lw2 = ParseInt(lwb, 1);
        LCD_DrawRotatedRect(x, y, (uint8_t)w, (uint8_t)h, (int16_t)rrangle, color, filled, lw2);
        return;
    }

    if (w < 1) w = 1; if (h < 1) h = 1;
    int rmax = (w < h ? w : h) / 2;
    if (radius > rmax) radius = rmax;
    if (radius < 1) radius = 4;

    int xe = x + w - 1, ye = y + h - 1;
    if (filled) {
        /* 中间矩形 + 四边条 + 四角扇形 */
        LCD_Fill(x + radius, y, xe - radius, ye, color);
        LCD_Fill(x, y + radius, xe, ye - radius, color);
        LCD_DrawFilledCircle(x + radius, y + radius, radius, color);
        LCD_DrawFilledCircle(xe - radius, y + radius, radius, color);
        LCD_DrawFilledCircle(x + radius, ye - radius, radius, color);
        LCD_DrawFilledCircle(xe - radius, ye - radius, radius, color);
    } else {
        /* 4 直线 */
        LCD_DrawLine(ClampX(x + radius), ClampY(y), ClampX(xe - radius), ClampY(y), color);
        LCD_DrawLine(ClampX(x + radius), ClampY(ye), ClampX(xe - radius), ClampY(ye), color);
        LCD_DrawLine(ClampX(x), ClampY(y + radius), ClampX(x), ClampY(ye - radius), color);
        LCD_DrawLine(ClampX(xe), ClampY(y + radius), ClampX(xe), ClampY(ye - radius), color);
        /* 四角弧线: Bresenham 每角 2 个八分点 */
        int16_t rx = radius, ry = 0, err = 1 - radius;
        int16_t tlx = x + radius,     tly = y + radius;       /* 左上角心 */
        int16_t trx = xe - radius,    try_ = y + radius;       /* 右上角心 */
        int16_t blx = x + radius,     bly = ye - radius;      /* 左下角心 */
        int16_t brx = xe - radius,    bry = ye - radius;      /* 右下角心 */
        while (rx >= ry) {
            /* 右下: (x,y) (y,x) — 象限 +x,+y */
            LCD_DrawPoint(ClampX(brx+rx), ClampY(bry+ry), color);
            LCD_DrawPoint(ClampX(brx+ry), ClampY(bry+rx), color);
            /* 左下: (-x,y) (-y,x) — 象限 -x,+y */
            LCD_DrawPoint(ClampX(blx-rx), ClampY(bly+ry), color);
            LCD_DrawPoint(ClampX(blx-ry), ClampY(bly+rx), color);
            /* 右上: (x,-y) (y,-x) — 象限 +x,-y */
            LCD_DrawPoint(ClampX(trx+rx), ClampY(try_-ry), color);
            LCD_DrawPoint(ClampX(trx+ry), ClampY(try_-rx), color);
            /* 左上: (-x,-y) (-y,-x) — 象限 -x,-y */
            LCD_DrawPoint(ClampX(tlx-rx), ClampY(tly-ry), color);
            LCD_DrawPoint(ClampX(tlx-ry), ClampY(tly-rx), color);
            ry++;
            if (err <= 0) { err += 2*ry + 1; }
            else { rx--; err += 2*(ry - rx) + 1; }
        }
    }
}

static void Handle_LCD_Circle(const char *cmd) {
    char b[16];
    GetField(cmd, b, 1, sizeof(b)); int cx = ParseInt(b, 0);
    GetField(cmd, b, 2, sizeof(b)); int cy = ParseInt(b, 0);
    GetField(cmd, b, 3, sizeof(b)); int r  = ParseInt(b, 0);
    char c[10]; GetField(cmd, c, 4, sizeof(c));
    uint16_t color = ParseColor(c);
    if (r < 1) r = 1;

    char f[8]; int filled = 0;
    if ((GetField(cmd, f, 5, sizeof(f)) == 0 && IsFillFlag(f)) ||
        (GetField(cmd, f, 6, sizeof(f)) == 0 && IsFillFlag(f)))
        filled = 1;

    if (filled)
        LCD_DrawFilledCircle(cx, cy, (uint8_t)r, color);
    else
        Draw_Circle(cx, cy, (uint8_t)r, color);
}

static void Handle_LCD_Ellipse(const char *cmd) {
    char b[16];
    GetField(cmd, b, 1, sizeof(b)); int cx = ParseInt(b, 0);
    GetField(cmd, b, 2, sizeof(b)); int cy = ParseInt(b, 0);
    GetField(cmd, b, 3, sizeof(b)); int a  = ParseInt(b, 0);
    GetField(cmd, b, 4, sizeof(b)); int b_ = ParseInt(b, 0);
    char c[10]; GetField(cmd, c, 5, sizeof(c));
    uint16_t color = ParseColor(c);
    if (a < 1) a = 1; if (b_ < 1) b_ = 1;

    char f[8]; int filled = 0;
    if ((GetField(cmd, f, 6, sizeof(f)) == 0 && IsFillFlag(f)) ||
        (GetField(cmd, f, 7, sizeof(f)) == 0 && IsFillFlag(f)))
        filled = 1;

    // 旋转椭圆
    const char *pe = cmd, *laste = cmd;
    while (*pe) { if (*pe == ',') laste = pe + 1; pe++; }
    int ellAngle = (laste[0] == 'a') ? ParseInt(laste + 1, 0) : 0;
    if (ellAngle != 0) {
        LCD_DrawRotatedEllipse(cx, cy, (uint8_t)a, (uint8_t)b_, (int16_t)ellAngle, color, filled);
        return;
    }

    if (filled) {
        LCD_DrawFilledEllipse(cx, cy, a, b_, color);
    } else {
        /* 中点椭圆算法 */
        int32_t a2 = (int32_t)a * a, b2 = (int32_t)b_ * b_;
        int16_t x = 0, y = b_;
        int32_t fx = 0, fy = 2 * a2 * y;
        int32_t d = b2 - a2 * b_ + a2 / 4;
        while (fx < fy) {
            int16_t px, py;
            px = ClampX(cx+x); py = ClampY(cy+y); LCD_DrawPoint(px, py, color);
            px = ClampX(cx-x); py = ClampY(cy+y); LCD_DrawPoint(px, py, color);
            px = ClampX(cx+x); py = ClampY(cy-y); LCD_DrawPoint(px, py, color);
            px = ClampX(cx-x); py = ClampY(cy-y); LCD_DrawPoint(px, py, color);
            x++; fx += 2 * b2;
            if (d < 0) { d += b2 + fx; }
            else { y--; fy -= 2 * a2; d += b2 + fx - fy; }
        }
        d = (int32_t)(b2 * (x*x + x) + a2 * (y*y - y) - a2 * b2) + b2/4 + a2/4;
        while (y >= 0) {
            int16_t px, py;
            px = ClampX(cx+x); py = ClampY(cy+y); LCD_DrawPoint(px, py, color);
            px = ClampX(cx-x); py = ClampY(cy+y); LCD_DrawPoint(px, py, color);
            px = ClampX(cx+x); py = ClampY(cy-y); LCD_DrawPoint(px, py, color);
            px = ClampX(cx-x); py = ClampY(cy-y); LCD_DrawPoint(px, py, color);
            y--; fy -= 2 * a2;
            if (d > 0) { d += a2 - fy; }
            else { x++; fx += 2 * b2; d += a2 - fy + fx; }
        }
    }
}

static void Handle_LCD_Triangle(const char *cmd) {
    char b[16];
    GetField(cmd, b, 1, sizeof(b)); int x0 = ParseInt(b, 0);
    GetField(cmd, b, 2, sizeof(b)); int y0 = ParseInt(b, 0);
    GetField(cmd, b, 3, sizeof(b)); int x1 = ParseInt(b, 0);
    GetField(cmd, b, 4, sizeof(b)); int y1 = ParseInt(b, 0);
    GetField(cmd, b, 5, sizeof(b)); int x2 = ParseInt(b, 0);
    GetField(cmd, b, 6, sizeof(b)); int y2 = ParseInt(b, 0);
    char c[10]; GetField(cmd, c, 7, sizeof(c));
    uint16_t color = ParseColor(c);

    char f[8]; int filled = 0;
    if ((GetField(cmd, f, 8, sizeof(f)) == 0 && IsFillFlag(f)) ||
        (GetField(cmd, f, 9, sizeof(f)) == 0 && IsFillFlag(f)))
        filled = 1;

    if (filled) {
        LCD_DrawFilledTriangle(x0, y0, x1, y1, x2, y2, color);
    } else {
        LCD_DrawLine(ClampX(x0), ClampY(y0), ClampX(x1), ClampY(y1), color);
        LCD_DrawLine(ClampX(x1), ClampY(y1), ClampX(x2), ClampY(y2), color);
        LCD_DrawLine(ClampX(x2), ClampY(y2), ClampX(x0), ClampY(y0), color);
    }
}

static void Handle_LCD_Arc(const char *cmd) {
    char b[16];
    GetField(cmd, b, 1, sizeof(b)); int cx = ParseInt(b, 0);
    GetField(cmd, b, 2, sizeof(b)); int cy = ParseInt(b, 0);
    GetField(cmd, b, 3, sizeof(b)); int r  = ParseInt(b, 0);
    GetField(cmd, b, 4, sizeof(b)); int sa = ParseInt(b, 0);
    GetField(cmd, b, 5, sizeof(b)); int ea = ParseInt(b, 0);
    char c[10]; GetField(cmd, c, 6, sizeof(c));
    uint16_t color = ParseColor(c);

    char f[8]; int filled = 0;
    if ((GetField(cmd, f, 7, sizeof(f)) == 0 && IsFillFlag(f)) ||
        (GetField(cmd, f, 8, sizeof(f)) == 0 && IsFillFlag(f)))
        filled = 1;

    if (r < 1) r = 1;
    /* 规范化角度到 0..360 */
    while (sa < 0) sa += 360; while (sa >= 360) sa -= 360;
    while (ea < 0) ea += 360; while (ea >= 360) ea -= 360;

    int16_t x = r, y = 0, err = 1 - r;
    while (x >= y) {
        #define PLOT_ARC(px, py) do { \
            int16_t sx = cx+(px), sy = cy+(py); \
            if (sx >= 0 && sx < LCD_W && sy >= 0 && sy < LCD_H) { \
                float ang = atan2f((float)(py), (float)(px)) * 57.29578f; \
                if (ang < 0) ang += 360.0f; \
                int inRange = (sa <= ea) ? (ang >= (float)sa && ang <= (float)ea) \
                                         : (ang >= (float)sa || ang <= (float)ea); \
                if (inRange) { \
                    LCD_DrawPoint(sx, sy, color); \
                    if (filled) LCD_DrawLine(ClampX(cx), ClampY(cy), sx, sy, color); \
                } \
            } \
        } while(0)

        PLOT_ARC( x,  y); PLOT_ARC( y,  x);
        PLOT_ARC(-y,  x); PLOT_ARC(-x,  y);
        PLOT_ARC(-x, -y); PLOT_ARC(-y, -x);
        PLOT_ARC( y, -x); PLOT_ARC( x, -y);
        #undef PLOT_ARC
        y++;
        if (err <= 0) { err += 2*y + 1; }
        else { x--; err += 2*(y - x) + 1; }
    }
}

static void Handle_LCD_Text(const char *cmd) {
    char bx[16], by[16], content[128], bsize[8], c[10];
    GetField(cmd, bx,      1, sizeof(bx));
    GetField(cmd, by,      2, sizeof(by));
    GetField(cmd, content, 3, sizeof(content));
    GetField(cmd, bsize,   4, sizeof(bsize));
    GetField(cmd, c,       5, sizeof(c));
    int x = ParseInt(bx, 0);
    int y = ParseInt(by, 0);
    int fontSize = ParseInt(bsize, 16);
    uint16_t color = ParseColor(c);

    uint8_t sizey;
    if (fontSize <= 12)      sizey = 12;
    else if (fontSize <= 16) sizey = 16;
    else if (fontSize <= 24) sizey = 24;
    else                      sizey = 32;

    x = ClampX(x); y = ClampY(y);
    LCD_ShowString(x, y, (uint8_t *)content, color, BLACK, sizey, 0);
}

static void Handle_LCD_Clear(const char *cmd) {
    char c[10] = {0};
    uint16_t color = BLACK;
    if (GetField(cmd, c, 1, sizeof(c)) == 0 && c[0] == '#')
        color = ParseColor(c);
    f5_bg = color;       // F5: 记录背景色
    f5_count = 0;        // F5: 清空图形数组
    LCD_ClearFast(color);
}

/* ===== F5 增量同步：set / del handler ===== */

static void Handle_Set(const char *cmd) {
    // cmd = "set,a1,circle,149,117,84,#FFFFFF,fill"
    char id[8], type[16];
    if (GetField(cmd, id, 1, sizeof(id)) != 0) return;
    if (GetField(cmd, type, 2, sizeof(type)) != 0) return;

    // 提取 params（从 field 3 开始）
    const char *params = cmd;
    int commas = 0;
    while (*params && commas < 3) {
        if (*params == ',') commas++;
        params++;
    }

    // 存储: "type,params"（不含 "draw,set,id,"）
    char stored[256];
    snprintf(stored, sizeof(stored), "%s,%s", type, params);

    // Upsert
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
    // cmd = "del,a1"
    char id[8];
    if (GetField(cmd, id, 1, sizeof(id)) != 0) return;

    int idx = f5_find(id);
    if (idx < 0) return;

    // 移除并前移
    for (int i = idx; i < f5_count - 1; i++) {
        strcpy(f5_ids[i], f5_ids[i + 1]);
        strcpy(f5_cmds[i], f5_cmds[i + 1]);
    }
    f5_count--;

    f5_redraw_all();
}

static void Handle_LCD_FillRect(const char *cmd) {
    char b[16];
    GetField(cmd, b, 1, sizeof(b)); int x = ParseInt(b, 0);
    GetField(cmd, b, 2, sizeof(b)); int y = ParseInt(b, 0);
    GetField(cmd, b, 3, sizeof(b)); int w = ParseInt(b, 0);
    GetField(cmd, b, 4, sizeof(b)); int h = ParseInt(b, 0);
    char c[10]; GetField(cmd, c, 5, sizeof(c));
    uint16_t color = ParseColor(c);
    if (w < 1) w = 1; if (h < 1) h = 1;
    int x2 = ClampX(x + w - 1), y2 = ClampY(y + h - 1);
    LCD_Fill(ClampX(x), ClampY(y), x2, y2, color);
}

/* ===== 命令分发 ===== */

void LCD_DrawTest_ProcessCommand(const char *cmd)
{
    /* 跳过前缀（"lcd," 或 "draw," 已由 main.c 统一处理） */
    if (strncmp(cmd, "lcd,", 4) == 0)
        cmd += 4;
    else if (strncmp(cmd, "draw,", 5) == 0)
        cmd += 5;

    char type[16];
    if (GetField(cmd, type, 0, sizeof(type)) != 0) return;

    cmd_count++;

    if      (strcmp(type, "set")      == 0) Handle_Set(cmd);
    else if (strcmp(type, "del")      == 0) Handle_Del(cmd);
    else if (strcmp(type, "point")    == 0) Handle_LCD_Point(cmd);
    else if (strcmp(type, "line")     == 0) Handle_LCD_Line(cmd);
    else if (strcmp(type, "rect")     == 0) Handle_LCD_Rect(cmd);
    else if (strcmp(type, "rrect")    == 0) Handle_LCD_RoundedRect(cmd);
    else if (strcmp(type, "circle")   == 0) Handle_LCD_Circle(cmd);
    else if (strcmp(type, "ellipse")  == 0) Handle_LCD_Ellipse(cmd);
    else if (strcmp(type, "triangle") == 0) Handle_LCD_Triangle(cmd);
    else if (strcmp(type, "arc")      == 0) Handle_LCD_Arc(cmd);
    else if (strcmp(type, "text")     == 0) Handle_LCD_Text(cmd);
    else if (strcmp(type, "clear")    == 0) Handle_LCD_Clear(cmd);
    else if (strcmp(type, "fill")     == 0) Handle_LCD_FillRect(cmd);
}

/* ===== 主循环 ===== */

void LCD_DrawTest_Init(void)
{
    cmd_count = 0;
    LCD_ShowString(0, 260, (uint8_t *)"LCD Draw Ready", GREEN, BLACK, 16, 0);
    printf("[system,lcd_draw_test_ready]\r\n");
}

void LCD_DrawTest_Handle(void)
{
    if (UART_GetRxFlag(Serial_PC)) {
        char *data = UART_GetRxData(Serial_PC);
        if (data && *data) {
            if (strncmp(data, "lcd,", 4) == 0) {
                printf("[echo,%s]\r\n", data);
                LCD_DrawTest_ProcessCommand(data);
            }
        }
    }
    if (UART_GetRxFlag(Serial_BT)) {
        char *data = UART_GetRxData(Serial_BT);
        if (data && *data) {
            if (strncmp(data, "lcd,", 4) == 0) {
                Serial_Printf(&huart1, "[bt,%s]\r\n", data);
                LCD_DrawTest_ProcessCommand(data);
            }
        }
    }
}
