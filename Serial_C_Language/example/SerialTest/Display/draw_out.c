/*
 * draw_out.c — F4 移植版 (原名 test_draw.c)
 *
 * OLED 绘图数据发生器（MCU→PC 方向）
 * 将 [draw,...] 协议指令发送给 PC 端 Serial Monitor V2 渲染
 *
 * 协议已更新至 v2.5：所有线段类命令 #color 后追加 w=1（线宽）
 *
 * 指令清单：clear / fill / line / point / rect / circle / ellipse / triangle
 */

#include "draw_out.h"
#include "../../HardWare/Serial/Serial.h"
#include <math.h>

// ═══════════════════════════════════════════════════════════════════
// OLED_Draw_Test — 静态画布，验证全部 9 条 draw 指令
// ═══════════════════════════════════════════════════════════════════
void OLED_Draw_Test(void)
{
    // 1. 清屏 + 深灰底色
    Serial_Printf(&huart1, "[draw,clear,#1C1C1E]\r\n");
    HAL_Delay(10);

    // 2. 填充矩形 —— 顶部标题栏
    Serial_Printf(&huart1, "[draw,fill,0,0,800,40,#2D2D30]\r\n");
    // 底部分隔线
    Serial_Printf(&huart1, "[draw,line,0,40,800,40,#3E3E42,1]\r\n");

    // 3. 画点 —— 散布在标题栏右侧
    Serial_Printf(&huart1, "[draw,point,770,10,#FF6B6B]\r\n");
    Serial_Printf(&huart1, "[draw,point,775,15,#FFD93D]\r\n");
    Serial_Printf(&huart1, "[draw,point,770,20,#6BCB77]\r\n");
    Serial_Printf(&huart1, "[draw,point,775,25,#4D96FF]\r\n");
    Serial_Printf(&huart1, "[draw,point,770,30,#FF6B6B]\r\n");

    // 4. 空心矩形 —— 四个象限边框
    Serial_Printf(&huart1, "[draw,rect,10,50,380,200,#3E3E42,1]\r\n");   // 左上
    Serial_Printf(&huart1, "[draw,rect,410,50,380,200,#3E3E42,1]\r\n");  // 右上
    Serial_Printf(&huart1, "[draw,rect,10,270,380,200,#3E3E42,1]\r\n");  // 左下
    Serial_Printf(&huart1, "[draw,rect,410,270,380,200,#3E3E42,1]\r\n"); // 右下

    // 5. 左上 —— 空心圆 + 十字线
    Serial_Printf(&huart1, "[draw,circle,200,150,80,#FF6B6B,1]\r\n");   // 红圆
    Serial_Printf(&huart1, "[draw,line,200,70,200,230,#FF6B6B,1]\r\n");  // 竖线
    Serial_Printf(&huart1, "[draw,line,120,150,280,150,#FF6B6B,1]\r\n"); // 横线

    // 6. 右上 —— 椭圆 + 对角线
    Serial_Printf(&huart1, "[draw,ellipse,600,150,120,70,#FFD93D,1]\r\n");    // 黄椭圆
    Serial_Printf(&huart1, "[draw,line,480,80,720,220,#FFD93D,1]\r\n");       // 对角线
    Serial_Printf(&huart1, "[draw,line,720,80,480,220,#FFD93D,1]\r\n");       // 反对角线

    // 7. 左下 —— 三角形
    Serial_Printf(&huart1, "[draw,triangle,200,320,80,440,320,440,#6BCB77,1]\r\n");  // 绿三角
    Serial_Printf(&huart1, "[draw,triangle,120,340,200,290,280,340,#6BCB77,1]\r\n"); // 倒三角

    // 8. 右下 —— 填充矩形色块
    Serial_Printf(&huart1, "[draw,fill,430,290,80,50,#4D96FF]\r\n");   // 蓝色块
    Serial_Printf(&huart1, "[draw,fill,530,290,80,50,#FF6B6B]\r\n");   // 红色块
    Serial_Printf(&huart1, "[draw,fill,630,290,80,50,#FFD93D]\r\n");   // 黄色块
    Serial_Printf(&huart1, "[draw,fill,430,360,80,50,#6BCB77]\r\n");   // 绿色块
    Serial_Printf(&huart1, "[draw,fill,530,360,80,50,#C084FC]\r\n");   // 紫色块
    Serial_Printf(&huart1, "[draw,fill,630,360,80,50,#FF8C42]\r\n");   // 橙色块
    Serial_Printf(&huart1, "[draw,fill,430,430,280,30,#3E3E42]\r\n");  // 底部条

    // 9. 中间十字线（跨象限）
    Serial_Printf(&huart1, "[draw,line,400,50,400,470,#555555,1]\r\n");  // 竖中线
    Serial_Printf(&huart1, "[draw,line,10,260,790,260,#555555,1]\r\n");  // 横中线

    // 10. 四角标记点
    Serial_Printf(&huart1, "[draw,fill,0,0,10,10,#FFFFFF]\r\n");       // 左上角
    Serial_Printf(&huart1, "[draw,fill,790,0,10,10,#FFFFFF]\r\n");     // 右上角
    Serial_Printf(&huart1, "[draw,fill,0,470,10,10,#FFFFFF]\r\n");     // 左下角
    Serial_Printf(&huart1, "[draw,fill,790,470,10,10,#FFFFFF]\r\n");   // 右下角
}

// ═══════════════════════════════════════════════════════════════════
// 旋转扫描线（雷达风格）
// 每帧 clear + 重绘底盘 + 画新线，约 5 秒转一圈
// ~120 bytes/帧 @ 50ms = ~2.4KB/s，115200 带宽占 ~20%
// ═══════════════════════════════════════════════════════════════════

#define CX  400.0f       // 屏幕中心 X
#define CY  240.0f       // 屏幕中心 Y
#define R   220.0f       // 扫描线半径
#define BG  "#0A0F0A"    // 背景色（暗绿）
#define FG  "#00FF41"    // 扫描线色（雷达绿）
#define RING "#0F2F0F"   // 距环色（微亮绿）
#define DOT "#00FF41"    // 中心点色

static float angle = 0.0f;      // 当前角度（rad）

// ── 初始化：画静态底盘（只调用一次）─────────────────────────
void Test_RadarInit(void)
{
    // 清屏
    Serial_Printf(&huart1, "[draw,clear,%s]\r\n", BG);
    HAL_Delay(10);

    // 3 圈同心距环
    Serial_Printf(&huart1, "[draw,circle,%d,%d,55,%s,1]\r\n",
                  (int)CX, (int)CY, RING);
    Serial_Printf(&huart1, "[draw,circle,%d,%d,110,%s,1]\r\n",
                  (int)CX, (int)CY, RING);
    Serial_Printf(&huart1, "[draw,circle,%d,%d,165,%s,1]\r\n",
                  (int)CX, (int)CY, RING);

    // 中心点（小填充方块）
    Serial_Printf(&huart1, "[draw,fill,%d,%d,6,6,%s]\r\n",
                  (int)CX - 3, (int)CY - 3, DOT);
}

// ── 每 50ms 调用：全清 + 重绘底盘 + 画新线 ────────────────
void Test_RadarLoop(void)
{
    // 1. 全清
    Serial_Printf(&huart1, "[draw,clear,%s]\r\n", BG);

    // 2. 重绘静态底盘
    Serial_Printf(&huart1, "[draw,circle,%d,%d,55,%s,1]\r\n",  (int)CX, (int)CY, RING);
    Serial_Printf(&huart1, "[draw,circle,%d,%d,110,%s,1]\r\n", (int)CX, (int)CY, RING);
    Serial_Printf(&huart1, "[draw,circle,%d,%d,165,%s,1]\r\n", (int)CX, (int)CY, RING);
    Serial_Printf(&huart1, "[draw,fill,%d,%d,6,6,%s]\r\n",   (int)CX-3, (int)CY-3, DOT);

    // 3. 角度推进（约 5 秒转一圈）
    angle += 0.063f;
    if (angle > 6.283185f) angle -= 6.283185f;

    // 4. 画新线
    int nx = (int)(CX + R * cosf(angle));
    int ny = (int)(CY + R * sinf(angle));
    Serial_Printf(&huart1, "[draw,line,%d,%d,%d,%d,%s,1]\r\n",
                  (int)CX, (int)CY, nx, ny, FG);
}
