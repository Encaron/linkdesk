#include "lcd.h"
#include "lcd_init.h"
#include "lcdfont.h"
#include "main.h"  // 替换原来的delay.h
#include "lcd_dma.h"


/****用户自主添加函数区域********/



/*****************************/

// 微秒延时函数声明
void delay_us(uint16_t us);


/******************************************************************************
      函数说明：在指定区域填充颜色
      入口数据：xsta,ysta   起始坐标
                xend,yend   终止坐标
								color       要填充的颜色
      返回值：  无
******************************************************************************/
void LCD_Fill(uint16_t xsta,uint16_t ysta,uint16_t xend,uint16_t yend,uint16_t color)
{
//	// 边界检查
//	    if (xsta >= LCD_W || ysta >= LCD_H ||
//	        xend > LCD_W || yend > LCD_H ||
//	        xsta > xend || ysta > yend)
//	        return;
//
//	uint16_t i,j;
//	LCD_Address_Set(xsta,ysta,xend-1,yend-1);//设置显示范围
//	for(i=ysta;i<yend;i++)
//	{
//		for(j=xsta;j<xend;j++)
//		{
//			LCD_WR_DATA(color);
//		}
//	}

/*********DMA***************/
	 // 边界检查
	    if (xsta >= LCD_W || ysta >= LCD_H ||
	        xend >= LCD_W || yend >= LCD_H ||
	        xsta > xend || ysta > yend)
	        return;

	    // 设置显示范围
	    LCD_Address_Set(xsta, ysta, xend, yend);

	    // 计算像素数量
	    uint32_t width = xend - xsta + 1;
	    uint32_t height = yend - ysta + 1;
	    uint32_t total_pixels = width * height;

	    // 使用DMA填充颜色
	    LCD_WR_DATA_DMA(color, total_pixels);

	    // 等待DMA完成
	    LCD_DMA_WaitForCompletion(100); // 等待100ms
}

/******************************************************************************
 * 函数说明：快速清屏
 * 入口数据：color 填充颜色
 * 返回值：无
 * 说明：比LCD_Fill更快的全屏填充
 ******************************************************************************/
void LCD_ClearFast(uint16_t color)
{
    // 设置全屏地址
//    LCD_Address_Set(0, 0, LCD_W-1, LCD_H-1);
//
//    // 一次性写入所有像素点
//    for(uint32_t i = 0; i < (uint32_t)LCD_W * LCD_H; i++)
//    {
//        LCD_WR_DATA(color);
//    }

	/*********DMA****************/
	  // 设置全屏地址
	    LCD_Address_Set(0, 0, LCD_W-1, LCD_H-1);

	    // 使用DMA填充全屏
	    uint32_t total_pixels = (uint32_t)LCD_W * LCD_H;
	    LCD_WR_DATA_DMA(color, total_pixels);
}


/******************************************************************************
      函数说明：在指定位置画点
      入口数据：x,y 画点坐标
                color 点的颜色
      返回值：  无
******************************************************************************/
void LCD_DrawPoint(uint16_t x,uint16_t y,uint16_t color)
{
	LCD_Address_Set(x,y,x,y);//设置光标位置
	LCD_WR_DATA(color);
} 


/******************************************************************************
      函数说明：画线
      入口数据：x1,y1   起始坐标
                x2,y2   终止坐标
                color   线的颜色
      返回值：  无
******************************************************************************/
void LCD_DrawLine(uint16_t x1,uint16_t y1,uint16_t x2,uint16_t y2,uint16_t color)
{
	uint16_t t;
	int xerr=0,yerr=0,delta_x,delta_y,distance;
	int incx,incy,uRow,uCol;
	delta_x=x2-x1; //计算坐标增量
	delta_y=y2-y1;
	uRow=x1;//画线起点坐标
	uCol=y1;
	if(delta_x>0)incx=1; //设置单步方向
	else if (delta_x==0)incx=0;//垂直线
	else {incx=-1;delta_x=-delta_x;}
	if(delta_y>0)incy=1;
	else if (delta_y==0)incy=0;//水平线
	else {incy=-1;delta_y=-delta_y;}
	if(delta_x>delta_y)distance=delta_x; //选取基本增量坐标轴
	else distance=delta_y;
	for(t=0;t<distance+1;t++)
	{
		LCD_DrawPoint(uRow,uCol,color);//画点
		xerr+=delta_x;
		yerr+=delta_y;
		if(xerr>distance)
		{
			xerr-=distance;
			uRow+=incx;
		}
		if(yerr>distance)
		{
			yerr-=distance;
			uCol+=incy;
		}
	}
}


/******************************************************************************
      函数说明：画矩形
      入口数据：x1,y1   起始坐标
                x2,y2   终止坐标
                color   矩形的颜色
      返回值：  无
******************************************************************************/
void LCD_DrawRectangle(uint16_t x1, uint16_t y1, uint16_t x2, uint16_t y2,uint16_t color)
{
	LCD_DrawLine(x1,y1,x2,y1,color);
	LCD_DrawLine(x1,y1,x1,y2,color);
	LCD_DrawLine(x1,y2,x2,y2,color);
	LCD_DrawLine(x2,y1,x2,y2,color);
}


/******************************************************************************
      函数说明：画圆
      入口数据：x0,y0   圆心坐标
                r       半径
                color   圆的颜色
      返回值：  无
******************************************************************************/
void Draw_Circle(uint16_t x0,uint16_t y0,uint8_t r,uint16_t color)
{
	int a,b;
	a=0;b=r;	  
	while(a<=b)
	{
		LCD_DrawPoint(x0-b,y0-a,color);             //3           
		LCD_DrawPoint(x0+b,y0-a,color);             //0           
		LCD_DrawPoint(x0-a,y0+b,color);             //1                
		LCD_DrawPoint(x0-a,y0-b,color);             //2             
		LCD_DrawPoint(x0+b,y0+a,color);             //4               
		LCD_DrawPoint(x0+a,y0-b,color);             //5
		LCD_DrawPoint(x0+a,y0+b,color);             //6 
		LCD_DrawPoint(x0-b,y0+a,color);             //7
		a++;
		if((a*a+b*b)>(r*r))//判断要画的点是否过远
		{
			b--;
		}
	}
}

/******************************************************************************
函数说明：绘制四分之一圆弧（用于圆角）
入口数据：x, y - 圆心坐标
          start_angle - 起始角度 (0: 0°, 90: 90°, 180: 180°, 270: 270°)
          end_angle - 结束角度
          r - 半径
          c - 颜色
返回值：无
说明：此函数用于绘制圆角矩形的四个圆角
******************************************************************************/
void Drawarc(int x,int y,int a,int b,unsigned int r,unsigned int c)
{
    int x_tp, y_tp;
    int d; // Decision variable

    // Start with the top and bottom rows of the circle
    for (x_tp = 0; x_tp <= r; x_tp++) {
        // Calculate the corresponding y values
        y_tp = (int)sqrt(r * r - x_tp * x_tp);

        // Draw the horizontal lines from the circle edge to the center
        for (int i = x_tp; i >= -x_tp; i--) {
            LCD_DrawPoint(x + i, y - y_tp, c);
            LCD_DrawPoint(x + i, y + y_tp, c);
        }
    }

    // Now fill the rest of the circle
    d = 3 - 2 * r;
    while (x_tp > y_tp) {
        if (d < 0) {
            d += 4 * x_tp + 6;
        } else {
            d += 4 * (x_tp - y_tp) + 10;
            y_tp++;
        }
        x_tp--;

        // Draw the horizontal lines from the circle edge to the center
        for (int i = -x_tp; i <= x_tp; i++) {
            LCD_DrawPoint(x + i, y - y_tp, c);
            LCD_DrawPoint(x + i, y + y_tp, c);
        }

        // Draw the vertical lines from the circle edge to the center
        for (int i = -y_tp; i <= y_tp; i++) {
            LCD_DrawPoint(x + x_tp, y + i, c);
            LCD_DrawPoint(x - x_tp, y + i, c);
        }
    }
}


/******************************************************************************
函数说明：绘制填充的圆角矩形
入口数据：xsta, ysta - 起始坐标（左上角）
          xend, yend - 结束坐标（右下角）
          color - 填充颜色
返回值：无
说明：绘制一个指定半径圆角的填充矩形
******************************************************************************/
void LCD_ArcRect(unsigned int xsta,unsigned int ysta,unsigned int xend,unsigned int yend,unsigned int color)
{

	// 边界检查：确保坐标在屏幕范围内
	    if (xsta >= LCD_W || ysta >= LCD_H ||
	        xend >= LCD_W || yend >= LCD_H ||
	        xsta > xend || ysta > yend)
	        return;

	    unsigned int r = 4; // 圆角半径

	    // 如果矩形太小，画不了圆角，就画普通矩形
	    if ((xend - xsta) < 2*r || (yend - ysta) < 2*r) {
	        LCD_Fill(xsta, ysta, xend, yend, color);
	        return;
	    }

	//int r = 4;
	//画四条边
	LCD_DrawLine(xsta+r,ysta,xend-r,ysta,color);
	LCD_DrawLine(xsta,ysta+r,xsta,yend-r,color);
	LCD_DrawLine(xsta+r,yend,xend-r,yend,color);
	LCD_DrawLine(xend,ysta+r,xend,yend-r,color);

	//再画四个圆角
	Drawarc(xsta+r,ysta+r,90,180,r,color);//左上
	Drawarc(xend-r,ysta+r,0,90,r,color);//右上
	Drawarc(xsta+r,yend-r,180,270,r,color);//左下
	Drawarc(xend-r,yend-r,270,360,r,color);//右下

	//画五个实心矩形
	LCD_Fill(xsta+r,ysta,xend-r,ysta+r,color);//上
	LCD_Fill(xend-r,ysta+r,xend,yend-r,color);//右
	LCD_Fill(xsta+r,yend-r,xend-r,yend,color);//下
	LCD_Fill(xsta,ysta+r,xsta+r,yend-r,color);//左
	LCD_Fill(xsta+r,ysta+r,xend-r,yend-r,color);//中

}


/******************************************************************************
      函数说明：显示汉字串
      入口数据：x,y显示坐标
                *s 要显示的汉字串
                fc 字的颜色
                bc 字的背景色
                sizey 字号 可选 16 24 32
                mode:  0非叠加模式  1叠加模式
      返回值：  无
******************************************************************************/
void LCD_ShowChinese(uint16_t x,uint16_t y,uint8_t *s,uint16_t fc,uint16_t bc,uint8_t sizey,uint8_t mode)
{
	while(*s!=0)
	{
		if(sizey==12) LCD_ShowChinese12x12(x,y,s,fc,bc,sizey,mode);
		else if(sizey==16) LCD_ShowChinese16x16(x,y,s,fc,bc,sizey,mode);
		else if(sizey==24) LCD_ShowChinese24x24(x,y,s,fc,bc,sizey,mode);
		else if(sizey==32) LCD_ShowChinese32x32(x,y,s,fc,bc,sizey,mode);
		else return;
		s+=2;
		x+=sizey;
	}
}

/******************************************************************************
      函数说明：显示单个12x12汉字
      入口数据：x,y显示坐标
                *s 要显示的汉字
                fc 字的颜色
                bc 字的背景色
                sizey 字号
                mode:  0非叠加模式  1叠加模式
      返回值：  无
******************************************************************************/
void LCD_ShowChinese12x12(uint16_t x,uint16_t y,uint8_t *s,uint16_t fc,uint16_t bc,uint8_t sizey,uint8_t mode)
{
	uint8_t i,j,m=0;
	uint16_t k;
	uint16_t HZnum;//汉字数目
	uint16_t TypefaceNum;//一个字符所占字节大小
	uint16_t x0=x;
	TypefaceNum=(sizey/8+((sizey%8)?1:0))*sizey;
	                         
	HZnum=sizeof(tfont12)/sizeof(typFNT_GB12);	//统计汉字数目
	for(k=0;k<HZnum;k++) 
	{
		if((tfont12[k].Index[0]==*(s))&&(tfont12[k].Index[1]==*(s+1)))
		{ 	
			LCD_Address_Set(x,y,x+sizey-1,y+sizey-1);
			for(i=0;i<TypefaceNum;i++)
			{
				for(j=0;j<8;j++)
				{	
					if(!mode)//非叠加方式
					{
						if(tfont12[k].Msk[i]&(0x01<<j))LCD_WR_DATA(fc);
						else LCD_WR_DATA(bc);
						m++;
						if(m%sizey==0)
						{
							m=0;
							break;
						}
					}
					else//叠加方式
					{
						if(tfont12[k].Msk[i]&(0x01<<j))	LCD_DrawPoint(x,y,fc);//画一个点
						x++;
						if((x-x0)==sizey)
						{
							x=x0;
							y++;
							break;
						}
					}
				}
			}
		}				  	
		continue;  //查找到对应点阵字库立即退出，防止多个汉字重复取模带来影响
	}
} 

/******************************************************************************
      函数说明：显示单个16x16汉字
      入口数据：x,y显示坐标
                *s 要显示的汉字
                fc 字的颜色
                bc 字的背景色
                sizey 字号
                mode:  0非叠加模式  1叠加模式
      返回值：  无
******************************************************************************/
void LCD_ShowChinese16x16(uint16_t x,uint16_t y,uint8_t *s,uint16_t fc,uint16_t bc,uint8_t sizey,uint8_t mode)
{
	uint8_t i,j,m=0;
	uint16_t k;
	uint16_t HZnum;//汉字数目
	uint16_t TypefaceNum;//一个字符所占字节大小
	uint16_t x0=x;
  TypefaceNum=(sizey/8+((sizey%8)?1:0))*sizey;
	HZnum=sizeof(tfont16)/sizeof(typFNT_GB16);	//统计汉字数目
	for(k=0;k<HZnum;k++) 
	{
		if ((tfont16[k].Index[0]==*(s))&&(tfont16[k].Index[1]==*(s+1)))
		{ 	
			LCD_Address_Set(x,y,x+sizey-1,y+sizey-1);
			for(i=0;i<TypefaceNum;i++)
			{
				for(j=0;j<8;j++)
				{	
					if(!mode)//非叠加方式
					{
						if(tfont16[k].Msk[i]&(0x01<<j))LCD_WR_DATA(fc);
						else LCD_WR_DATA(bc);
						m++;
						if(m%sizey==0)
						{
							m=0;
							break;
						}
					}
					else//叠加方式
					{
						if(tfont16[k].Msk[i]&(0x01<<j))	LCD_DrawPoint(x,y,fc);//画一个点
						x++;
						if((x-x0)==sizey)
						{
							x=x0;
							y++;
							break;
						}
					}
				}
			}
		}				  	
		continue;  //查找到对应点阵字库立即退出，防止多个汉字重复取模带来影响
	}
} 


/******************************************************************************
      函数说明：显示单个24x24汉字
      入口数据：x,y显示坐标
                *s 要显示的汉字
                fc 字的颜色
                bc 字的背景色
                sizey 字号
                mode:  0非叠加模式  1叠加模式
      返回值：  无
******************************************************************************/
void LCD_ShowChinese24x24(uint16_t x,uint16_t y,uint8_t *s,uint16_t fc,uint16_t bc,uint8_t sizey,uint8_t mode)
{
	uint8_t i,j,m=0;
	uint16_t k;
	uint16_t HZnum;//汉字数目
	uint16_t TypefaceNum;//一个字符所占字节大小
	uint16_t x0=x;
	TypefaceNum=(sizey/8+((sizey%8)?1:0))*sizey;
	HZnum=sizeof(tfont24)/sizeof(typFNT_GB24);	//统计汉字数目
	for(k=0;k<HZnum;k++) 
	{
		if ((tfont24[k].Index[0]==*(s))&&(tfont24[k].Index[1]==*(s+1)))
		{ 	
			LCD_Address_Set(x,y,x+sizey-1,y+sizey-1);
			for(i=0;i<TypefaceNum;i++)
			{
				for(j=0;j<8;j++)
				{	
					if(!mode)//非叠加方式
					{
						if(tfont24[k].Msk[i]&(0x01<<j))LCD_WR_DATA(fc);
						else LCD_WR_DATA(bc);
						m++;
						if(m%sizey==0)
						{
							m=0;
							break;
						}
					}
					else//叠加方式
					{
						if(tfont24[k].Msk[i]&(0x01<<j))	LCD_DrawPoint(x,y,fc);//画一个点
						x++;
						if((x-x0)==sizey)
						{
							x=x0;
							y++;
							break;
						}
					}
				}
			}
		}				  	
		continue;  //查找到对应点阵字库立即退出，防止多个汉字重复取模带来影响
	}
} 

/******************************************************************************
      函数说明：显示单个32x32汉字
      入口数据：x,y显示坐标
                *s 要显示的汉字
                fc 字的颜色
                bc 字的背景色
                sizey 字号
                mode:  0非叠加模式  1叠加模式
      返回值：  无
******************************************************************************/
void LCD_ShowChinese32x32(uint16_t x,uint16_t y,uint8_t *s,uint16_t fc,uint16_t bc,uint8_t sizey,uint8_t mode)
{
	uint8_t i,j,m=0;
	uint16_t k;
	uint16_t HZnum;//汉字数目
	uint16_t TypefaceNum;//一个字符所占字节大小
	uint16_t x0=x;
	TypefaceNum=(sizey/8+((sizey%8)?1:0))*sizey;
	HZnum=sizeof(tfont32)/sizeof(typFNT_GB32);	//统计汉字数目
	for(k=0;k<HZnum;k++) 
	{
		if ((tfont32[k].Index[0]==*(s))&&(tfont32[k].Index[1]==*(s+1)))
		{ 	
			LCD_Address_Set(x,y,x+sizey-1,y+sizey-1);
			for(i=0;i<TypefaceNum;i++)
			{
				for(j=0;j<8;j++)
				{	
					if(!mode)//非叠加方式
					{
						if(tfont32[k].Msk[i]&(0x01<<j))LCD_WR_DATA(fc);
						else LCD_WR_DATA(bc);
						m++;
						if(m%sizey==0)
						{
							m=0;
							break;
						}
					}
					else//叠加方式
					{
						if(tfont32[k].Msk[i]&(0x01<<j))	LCD_DrawPoint(x,y,fc);//画一个点
						x++;
						if((x-x0)==sizey)
						{
							x=x0;
							y++;
							break;
						}
					}
				}
			}
		}				  	
		continue;  //查找到对应点阵字库立即退出，防止多个汉字重复取模带来影响
	}
}


/******************************************************************************
      函数说明：显示单个字符
      入口数据：x,y显示坐标
                num 要显示的字符
                fc 字的颜色
                bc 字的背景色
                sizey 字号
                mode:  0非叠加模式  1叠加模式
      返回值：  无
******************************************************************************/
void LCD_ShowChar(uint16_t x,uint16_t y,uint8_t num,uint16_t fc,uint16_t bc,uint8_t sizey,uint8_t mode)
{
	uint8_t temp,sizex,t,m=0;
	uint16_t i,TypefaceNum;//一个字符所占字节大小
	uint16_t x0=x;
	sizex=sizey/2;
	TypefaceNum=(sizex/8+((sizex%8)?1:0))*sizey;
	num=num-' ';    //得到偏移后的值
	LCD_Address_Set(x,y,x+sizex-1,y+sizey-1);  //设置光标位置
	for(i=0;i<TypefaceNum;i++)
	{ 
		if(sizey==12)temp=ascii_1206[num][i];		       //调用6x12字体
		else if(sizey==16)temp=ascii_1608[num][i];		 //调用8x16字体
		else if(sizey==24)temp=ascii_2412[num][i];		 //调用12x24字体
		else if(sizey==32)temp=ascii_3216[num][i];		 //调用16x32字体
		else return;
		for(t=0;t<8;t++)
		{
			if(!mode)//非叠加模式
			{
				if(temp&(0x01<<t))LCD_WR_DATA(fc);
				else LCD_WR_DATA(bc);
				m++;
				if(m%sizex==0)
				{
					m=0;
					break;
				}
			}
			else//叠加模式
			{
				if(temp&(0x01<<t))LCD_DrawPoint(x,y,fc);//画一个点
				x++;
				if((x-x0)==sizex)
				{
					x=x0;
					y++;
					break;
				}
			}
		}
	}   	 	  
}


/******************************************************************************
      函数说明：显示字符串
      入口数据：x,y显示坐标
                *p 要显示的字符串
                fc 字的颜色
                bc 字的背景色
                sizey 字号
                mode:  0非叠加模式  1叠加模式
      返回值：  无
******************************************************************************/
void LCD_ShowString(uint16_t x,uint16_t y,const uint8_t *p,uint16_t fc,uint16_t bc,uint8_t sizey,uint8_t mode)
{         
	while(*p!='\0')
	{       
		LCD_ShowChar(x,y,*p,fc,bc,sizey,mode);
		x+=sizey/2;
		p++;
	}  
}


/******************************************************************************
      函数说明：显示数字
      入口数据：m底数，n指数
      返回值：  无
******************************************************************************/
uint32_t mypow(uint8_t m,uint8_t n)
{
	uint32_t result=1;
	while(n--)result*=m;
	return result;
}


/******************************************************************************
      函数说明：显示整数变量
      入口数据：x,y显示坐标
                num 要显示整数变量
                len 要显示的位数
                fc 字的颜色
                bc 字的背景色
                sizey 字号
      返回值：  无
******************************************************************************/
void LCD_ShowIntNum(uint16_t x,uint16_t y,uint16_t num,uint8_t len,uint16_t fc,uint16_t bc,uint8_t sizey)
{         	
	uint8_t t,temp;
	uint8_t enshow=0;
	uint8_t sizex=sizey/2;
	for(t=0;t<len;t++)
	{
		temp=(num/mypow(10,len-t-1))%10;
		if(enshow==0&&t<(len-1))
		{
			if(temp==0)
			{
				LCD_ShowChar(x+t*sizex,y,' ',fc,bc,sizey,0);
				continue;
			}else enshow=1; 
		 	 
		}
	 	LCD_ShowChar(x+t*sizex,y,temp+48,fc,bc,sizey,0);
	}
} 


/******************************************************************************
      函数说明：显示两位小数变量
      入口数据：x,y显示坐标
                num 要显示小数变量
                len 要显示的位数
                fc 字的颜色
                bc 字的背景色
                sizey 字号
      返回值：  无
******************************************************************************/
void LCD_ShowFloatNum1(uint16_t x,uint16_t y,float num,uint8_t len,uint16_t fc,uint16_t bc,uint8_t sizey)
{         	
	uint8_t t,temp,sizex;
	uint16_t num1;
	sizex=sizey/2;
	num1=num*100;
	for(t=0;t<len;t++)
	{
		temp=(num1/mypow(10,len-t-1))%10;
		if(t==(len-2))
		{
			LCD_ShowChar(x+(len-2)*sizex,y,'.',fc,bc,sizey,0);
			t++;
			len+=1;
		}
	 	LCD_ShowChar(x+t*sizex,y,temp+48,fc,bc,sizey,0);
	}
}


/******************************************************************************
      函数说明：显示图片
      入口数据：x,y起点坐标
                length 图片长度
                width  图片宽度
                pic[]  图片数组
      返回值：  无
******************************************************************************/
void LCD_ShowPicture(uint16_t x,uint16_t y,uint16_t length,uint16_t width,const uint8_t pic[])
{
	uint16_t i,j;
	uint32_t k=0;
	LCD_Address_Set(x,y,x+length-1,y+width-1);
	for(i=0;i<length;i++)
	{
		for(j=0;j<width;j++)
		{
			LCD_WR_DATA8(pic[k*2]);
			LCD_WR_DATA8(pic[k*2+1]);
			k++;
		}
	}			
}


/**
  * @brief 绘制渐变背景
  * @note 从深蓝色到深紫色的渐变，营造科技感
  */
void ui_draw_gradient_background(void)
{
    uint16_t i, j;
    uint16_t color;
    float ratio;

    // 从顶部到底部的渐变
    for(i = 0; i < SCREEN_HEIGHT; i++)
    {
        // 计算当前行的渐变比例
        ratio = (float)i / SCREEN_HEIGHT;

        // 从深蓝到深紫的渐变
        // R: 10->20, G: 14->10, B: 23->40
        uint8_t r = 10 + (uint8_t)(10 * ratio);
        uint8_t g = 14 - (uint8_t)(4 * ratio);
        uint8_t b = 23 + (uint8_t)(17 * ratio);

        // 转换为RGB565
        color = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);

        // 绘制一整行
        LCD_DrawLine(0, i, SCREEN_WIDTH-1, i, color);
    }
}

// 快速画垂直线（使用DMA）
void LCD_DrawLine_Vertical_DMA(uint16_t x, uint16_t y1, uint16_t y2, uint16_t color)
{
    if(y1 > y2) {
        uint16_t temp = y1;
        y1 = y2;
        y2 = temp;
    }

    if(x >= LCD_W || y1 >= LCD_H || y2 >= LCD_H) {
        return;
    }

    LCD_Address_Set(x, y1, x, y2);

    uint32_t length = y2 - y1 + 1;
    LCD_WR_DATA_DMA(color, length);
}
