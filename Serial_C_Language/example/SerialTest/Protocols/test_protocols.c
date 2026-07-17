/*
 * test_protocols.c — F4 移植版 (双滑杆)
 *
 * Serial Monitor V2 — 双滑杆 PWM
 *
 * 协议：
 *   [slider,Slider1,0~100]  → PC13 软件 PWM (TIM6, 100Hz/100级)
 *   [slider,Slider2,0~100]  → PB9  硬件 PWM (TIM11, 1kHz/1000级)
 */

#include "test_protocols.h"
#include "../Key/test_key.h"
#include "../Display/test_display.h"
#include "../Sensor/test_sensor.h"
#include "../../HardWare/Key/Key.h"
#include "../DrawTest/oled_draw_test.h"
#include "../DrawTest/lcd_draw_test.h"
#include "tim.h"
#include <stdlib.h>

float slider1_val = 0.0f;   // PC13 软件 PWM
float slider2_val = 0.0f;   // PB9  硬件 PWM

// ——— 软件 PWM 回调（TIM6 每 100µs 触发一次）———
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
    if (htim->Instance == TIM6) {
        static uint8_t pwm_cnt = 0;
        if (++pwm_cnt >= 100) pwm_cnt = 0;
        if (pwm_cnt < (uint8_t)slider1_val)
            GPIOC->BSRR = (uint32_t)GPIO_PIN_13 << 16;
        else
            GPIOC->BSRR = GPIO_PIN_13;
    }
    if (htim->Instance == TIM3) {
        Key_Tick();  // 1kHz 按键状态机
    }
}

// ——— 初始化 ———
void Test_Init(void)
{
    MX_TIM6_Init();
    slider1_val = 0.0f;
    slider2_val = 0.0f;

    UART_InitReceive(Serial_PC, SERIAL_PROTOCOL, SERIAL_SQUARE_BRACKET);

    Key_Init();

    HAL_TIM_Base_Start_IT(&htim6);
    HAL_TIM_PWM_Start(&htim11, TIM_CHANNEL_1);

    Log("---- 双滑杆 PWM + Key 就绪 ----\r\n");
    Log("Slider1 → PC13  TIM6  软件PWM 3.5kHz/100级\r\n");
    Log("Slider2 → PF7   TIM11 硬件PWM 1kHz/1000级\r\n");
    Log("PE1→[on]  PE3→[off]  蓝色LED\r\n");
}

// ——— PF8 LED 控制 ———
static void PF8_On(void)  { GPIOF->BSRR = (uint32_t)GPIO_PIN_8 << 16; }  // PF8 拉低→亮
static void PF8_Off(void) { GPIOF->BSRR = GPIO_PIN_8; }                  // PF8 拉高→灭

// ——— 物理按键（PE1→PF8开, PE3→PF8关）+ 同步 PC 虚拟开关 ———
void Test_KeyLoop(void)
{
    if (Key_Check(Key_1, KEY_DOWN)) {
        PF8_On();
        Log("[ctrl,led,蓝色LED,on]\r\n");
    }
    if (Key_Check(Key_3, KEY_DOWN)) {
        PF8_Off();
        Log("[ctrl,led,蓝色LED,off]\r\n");
    }
}

// ——— 协议处理（raw 由 main.c UART 分发传入）———
void Test_Handle(const char *raw)
{
    if (!raw || raw[0] == '\0') return;

    char type[16];
    GetField(raw, type, 0, sizeof(type));

    if (strcmp(type, "slider") == 0) {
        char name[32], valStr[16];
        GetField(raw, name,   1, sizeof(name));
        GetField(raw, valStr, 2, sizeof(valStr));
        float val = (float)atof(valStr);

        if (strcmp(name, "Slider1") == 0) {
            slider1_val = val;
            Log("[slider,%s,%.1f]\r\n", name, slider1_val);
        }
        else if (strcmp(name, "Slider2") == 0) {
            slider2_val = val;
            /* PF7 低电平点亮，0%=灭(CCR=999) 100%=亮(CCR=0) */
            __HAL_TIM_SET_COMPARE(&htim11, TIM_CHANNEL_1,
                (uint16_t)((100.0f - slider2_val) / 100.0f * 999));
            Log("[slider,%s,%.1f]\r\n", name, slider2_val);
        }
    } else if (strcmp(type, "ctrl") == 0) {
        char subType[16], name[32], valStr[16];
        GetField(raw, subType, 1, sizeof(subType));
        GetField(raw, name,    2, sizeof(name));
        GetField(raw, valStr,  3, sizeof(valStr));
        if (strcmp(subType, "led") == 0 && strcmp(name, "蓝色LED") == 0) {
            if (strcmp(valStr, "on") == 0) PF8_On();
            else if (strcmp(valStr, "off") == 0) PF8_Off();
        }
        else if (strcmp(subType, "slider") == 0 && strcmp(name, "电池电压") == 0) {
            sensor_batt = (float)atof(valStr);
        }
    } else {
        Test_KeyProcess(raw);
        Test_DisplayProcess(raw);
    }
}

// ——— 双滑杆绘图（每 50ms 调用一次）———
void Test_SliderLoop(void)
{
    Log("[plot,Slider1,%.1f][plot,Slider2,%.1f]\r\n", slider1_val, slider2_val);
}
