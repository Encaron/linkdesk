#ifndef __LCD_H
#define __LCD_H		
#include "main.h"  // 替换原来的sys.h
#include "lcd_init.h"


void LCD_Fill(uint16_t xsta,uint16_t ysta,uint16_t xend,uint16_t yend,uint16_t color);//指定区域填充颜色
void LCD_ClearFast(uint16_t color);//快速渲染
void LCD_DrawPoint(uint16_t x,uint16_t y,uint16_t color);//在指定位置画一个点
void LCD_DrawLine(uint16_t x1,uint16_t y1,uint16_t x2,uint16_t y2,uint16_t color);//在指定位置画一条线
void LCD_DrawRectangle(uint16_t x1, uint16_t y1, uint16_t x2, uint16_t y2,uint16_t color);//在指定位置画一个矩形
void Draw_Circle(uint16_t x0,uint16_t y0,uint8_t r,uint16_t color);//在指定位置画一个圆

void LCD_ShowChinese(uint16_t x,uint16_t y,uint8_t *s,uint16_t fc,uint16_t bc,uint8_t sizey,uint8_t mode);//显示汉字串
void LCD_ShowChinese12x12(uint16_t x,uint16_t y,uint8_t *s,uint16_t fc,uint16_t bc,uint8_t sizey,uint8_t mode);//显示单个12x12汉字
void LCD_ShowChinese16x16(uint16_t x,uint16_t y,uint8_t *s,uint16_t fc,uint16_t bc,uint8_t sizey,uint8_t mode);//显示单个16x16汉字
void LCD_ShowChinese24x24(uint16_t x,uint16_t y,uint8_t *s,uint16_t fc,uint16_t bc,uint8_t sizey,uint8_t mode);//显示单个24x24汉字
void LCD_ShowChinese32x32(uint16_t x,uint16_t y,uint8_t *s,uint16_t fc,uint16_t bc,uint8_t sizey,uint8_t mode);//显示单个32x32汉字

void LCD_ShowChar(uint16_t x,uint16_t y,uint8_t num,uint16_t fc,uint16_t bc,uint8_t sizey,uint8_t mode);//显示一个字符
void LCD_ShowString(uint16_t x,uint16_t y,const uint8_t *p,uint16_t fc,uint16_t bc,uint8_t sizey,uint8_t mode);//显示字符串
uint32_t mypow(uint8_t m,uint8_t n);//求幂
void LCD_ShowIntNum(uint16_t x,uint16_t y,uint16_t num,uint8_t len,uint16_t fc,uint16_t bc,uint8_t sizey);//显示整数变量
void LCD_ShowFloatNum1(uint16_t x,uint16_t y,float num,uint8_t len,uint16_t fc,uint16_t bc,uint8_t sizey);//显示两位小数变量

void LCD_ShowPicture(uint16_t x,uint16_t y,uint16_t length,uint16_t width,const uint8_t pic[]);//显示图片

void LCD_ArcRect(unsigned int xsta,unsigned int ysta,unsigned int xend,unsigned int yend,unsigned int color);//画圆角


//画笔颜色 (RGB565格式)
#define WHITE         	 0xFFFF //白色
#define BLACK         	 0x0000 //黑色
#define BLUE           	 0x001F //蓝色
#define BRED             0XF81F //棕红色 (实际更偏紫红色)
#define GRED 			 0XFFE0 //渐变红 (实际是黄色)
#define GBLUE			 0X07FF //渐变蓝 (实际是青色)
#define RED           	 0xF800 //红色
#define MAGENTA       	 0xF81F //洋红色/品红色
#define GREEN         	 0x07E0 //绿色
#define CYAN          	 0x7FFF //青色
#define YELLOW        	 0xFFE0 //黄色
#define BROWN 			 0XBC40 //棕色
#define BRRED 			 0XFC07 //棕红色
#define GRAY  			 0X8430 //灰色
#define DARKBLUE      	 0X01CF //深蓝色
#define LIGHTBLUE      	 0X7D7C //浅蓝色
#define GRAYBLUE       	 0X5458 //灰蓝色
#define LIGHTGREEN     	 0X841F //浅绿色 (实际是深粉色/紫色)
#define LGRAY 			 0XC618 //浅灰色 (常用于面板背景)
#define LGRAYBLUE        0XA651 //浅灰蓝色 (常用于中间层)
#define LBBLUE           0X2B12 //浅棕蓝色 (常用于选中项的反色)
#define ORANGE         	 0xFD20 //橙色
#define PINK             0xFE19 //粉色
#define PURPLE         	 0x8010 //紫色
#define OLIVE          	 0x7BE0 //橄榄绿
#define DARKGRAY         0x4208 //深灰色



// 在ui.h中添加颜色定义（16位RGB565格式）
// 科技蓝主题颜色（从24位转换而来）
#define COLOR_DEEP_BLUE     0x195B    // 深科技蓝 (原0x2B5B9C)
#define COLOR_BRIGHT_BLUE   0x34D5    // 亮科技蓝 (原0x4A90E2)
#define COLOR_LIGHT_BLUE    0x56BF    // 浅科技蓝 (原0x63B3ED)
#define COLOR_SPACE_BG      0x0841    // 深空背景 (原0x0A0E17)
#define COLOR_WHITE_TEXT    0xFFFF    // 白色文字 (原0xFFFFFF)
#define COLOR_CYAN_HL       0x07FF    // 高亮青色 (原0x00D4FF)


void ui_draw_gradient_background(void);
uint16_t ui_color_interpolate(uint16_t color1, uint16_t color2, float ratio);

// 屏幕尺寸宏定义（在lcd.h开头或合适位置添加）
#define SCREEN_WIDTH   LCD_W
#define SCREEN_HEIGHT  LCD_H

void ui_draw_gradient_background(void);
void LCD_DrawLine_Vertical_DMA(uint16_t x, uint16_t y1, uint16_t y2, uint16_t color);

#endif





