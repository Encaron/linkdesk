#ifndef __OLED_H
#define __OLED_H

#include <stdint.h>
#include "OLED_Data.h"

/*参数宏定义*********************/
#define OLED_SCL_GPIO 	  	GPIOA
#define OLED_SCL_PIN   		GPIO_PIN_8
#define OLED_SDA_GPIO  		GPIOC
#define OLED_SDA_PIN   		GPIO_PIN_9

/*FontSize参数取值*/
/*此参数值不仅用于判断，而且用于计算横向字符偏移，默认值为字体像素宽度*/
#define OLED_8X16				8
#define OLED_6X8				6

/*IsFilled参数数值*/
#define OLED_UNFILLED			0
#define OLED_FILLED				1

/*********************参数宏定义*/


/*函数声明*********************/

/*初始化函数*/
void OLED_Init(void);    //OLED初始化

/*更新函数*/
void OLED_Update(void);   //更新全屏
void OLED_UpdateArea(int16_t X, int16_t Y, uint8_t Width, uint8_t Height);  //更新指定区域

/*显存控制函数*/
void OLED_Clear(void);  //清空全屏
void OLED_ClearArea(int16_t X, int16_t Y, uint8_t Width, uint8_t Height);   //清空指定区域
void OLED_Reverse(void);   //全屏反色显示
void OLED_ReverseArea(int16_t X, int16_t Y, uint8_t Width, uint8_t Height);  //指定区域反色显示

/*显示函数*/
void OLED_ShowChar(int16_t X, int16_t Y, char Char, uint8_t FontSize);   //显示字符
void OLED_ShowString(int16_t X, int16_t Y, char *String, uint8_t FontSize);   //显示字符串
void OLED_ShowNum(int16_t X, int16_t Y, uint32_t Number, uint8_t Length, uint8_t FontSize);   //显示数字
void OLED_ShowSignedNum(int16_t X, int16_t Y, int32_t Number, uint8_t Length, uint8_t FontSize);   //显示符号数字
void OLED_ShowHexNum(int16_t X, int16_t Y, uint32_t Number, uint8_t Length, uint8_t FontSize);   //显示十六进制
void OLED_ShowBinNum(int16_t X, int16_t Y, uint32_t Number, uint8_t Length, uint8_t FontSize);   //显示二进制
void OLED_ShowFloatNum(int16_t X, int16_t Y, double Number, uint8_t IntLength, uint8_t FraLength, uint8_t FontSize);   //显示浮点数字
void OLED_ShowImage(int16_t X, int16_t Y, uint8_t Width, uint8_t Height, const uint8_t *Image);   //显示图像
void OLED_Printf(int16_t X, int16_t Y, uint8_t FontSize, char *format, ...);    //打印格式化字符串

/*绘图函数*/
void OLED_DrawPoint(int16_t X, int16_t Y);   //画一个点
void OLED_ClearPoint(int16_t X, int16_t Y);  //清除一个点（橡皮擦用）
uint8_t OLED_GetPoint(int16_t X, int16_t Y);  //获取点是否点亮状态
void OLED_DrawLine(int16_t X0, int16_t Y0, int16_t X1, int16_t Y1);  //画直线
void OLED_ClearLine(int16_t X0, int16_t Y0, int16_t X1, int16_t Y1); //擦除直线（橡皮擦用）
void OLED_DrawRectangle(int16_t X, int16_t Y, uint8_t Width, uint8_t Height, uint8_t IsFilled);  //画矩形
void OLED_DrawTriangle(int16_t X0, int16_t Y0, int16_t X1, int16_t Y1, int16_t X2, int16_t Y2, uint8_t IsFilled);  //画三角形
void OLED_DrawCircle(int16_t X, int16_t Y, uint8_t Radius, uint8_t IsFilled);  //画圆
void OLED_DrawEllipse(int16_t X, int16_t Y, uint8_t A, uint8_t B, uint8_t IsFilled);  //画椭圆
void OLED_DrawArc(int16_t X, int16_t Y, uint8_t Radius, int16_t StartAngle, int16_t EndAngle, uint8_t IsFilled); //画圆弧
void OLED_DrawRoundedRect(int16_t X, int16_t Y, uint8_t Width, uint8_t Height, uint8_t Radius, uint8_t IsFilled); //画圆角矩形
void OLED_DrawRotatedEllipse(int16_t cx, int16_t cy, uint8_t a, uint8_t b, int16_t angle, uint8_t IsFilled); //画旋转椭圆
void OLED_DrawRotatedRect(int16_t X, int16_t Y, uint8_t Width, uint8_t Height, int16_t Angle, uint8_t IsFilled); //画旋转矩形

/*********************函数声明*/

#endif


/*****************江协科技|版权所有****************/
/*****************jiangxiekeji.com****************/
