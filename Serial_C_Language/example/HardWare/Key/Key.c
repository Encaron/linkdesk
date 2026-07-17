/*
 * Key.c
 *
 *  Created on: Mar 9, 2025
 *      Author: FengYiLi
 */

#include "KEY.h"

/* 内部使用的常量定义 */
#define KEY_STATE_PRESSED            1   // 按键物理按下状态
#define KEY_STATE_RELEASED           0   // 按键物理释放状态

/* 全局变量 - 存储所有按键的状态标志位 */
uint8_t Key_Flag[KEY_COUNT];

/***************************************************************************/
/********************添加按键，只改这里******************************************/
/***************************************************************************/

/**
  * @brief  获取指定按键的当前物理状态（内部函数）
  * @param  KeyNumber: 按键编号
  * @retval KEY_STATE_PRESSED  - 按键当前处于按下状态
  *         KEY_STATE_RELEASED - 按键当前处于释放状态
  *
  * @note   [必须修改] 添加新按键时需要在此函数中添加对应的case分支
  */
static uint8_t Key_GetPhysicalState(uint8_t KeyNumber) {
	/* ========== [必须修改] 添加新按键时需要修改此部分 ========== */
	switch (KeyNumber) {
	case Key_1: return (HAL_GPIO_ReadPin(Key_GPIO1, Key_Pin_1) == GPIO_PIN_RESET) ? KEY_STATE_PRESSED : KEY_STATE_RELEASED;

	case Key_2: return (HAL_GPIO_ReadPin(Key_GPIO1, Key_Pin_2) == GPIO_PIN_RESET) ? KEY_STATE_PRESSED : KEY_STATE_RELEASED;

	case Key_3: return (HAL_GPIO_ReadPin(Key_GPIO1, Key_Pin_3) == GPIO_PIN_RESET) ? KEY_STATE_PRESSED : KEY_STATE_RELEASED;

	case Key_4: return (HAL_GPIO_ReadPin(Key_GPIO1, Key_Pin_4) == GPIO_PIN_RESET) ? KEY_STATE_PRESSED : KEY_STATE_RELEASED;

	default:
		return KEY_STATE_RELEASED;  // 未知按键编号返回释放状态
	}
	/* ========== [必须修改] 添加新按键时需要修改的部分结束 ========== */
}

/***************************************************************************/
/********************以下全为内部函数******************************************/
/***************************************************************************/

/**
  * @brief  获取当前按键状态
  * @param  n :Flag
  *	  @arg n: The "n" can find the key number which is chosen.
  *									Which can be "Key_1", "Key_2" and you will find others at Key.h
  *	  @arg Flag: The "flag" can be used to mark a flag bit to obtain the current key status.
  *									Which can be "KEY_SINGLE","KEY_DOUBLE" and uou will find others at Key.h
  * @retval 1  ，0
  */
/**
  * @brief  初始化按键硬件（如果需要的话）
  * @param  None
  * @retval None
  *
  * @note   如果按键GPIO已经在其他地方初始化，此函数可以为空
  */
void Key_Init(void)
{
    /* 如果需要在此初始化按键GPIO，请在此添加代码 */
}

/**
  * @brief  检查指定按键的特定状态标志（外部接口保持不变）
  *
  * @param  n: 按键编号
  *   @arg:    Key_1, Key_2, Key_3, Key_4, Key_5
  *
  * @param  Flag: 要检查的状态标志类型
  *   @arg: - KEY_SINGLE:  单击事件（按下后快速松开） 		 - KEY_DOUBLE:  双击事件（快速连续按下两次）
  *         - KEY_LONG:    长按事件（按住超过设定时间）	 - KEY_REPEAT:  重复触发事件（长按后周期性触发）
  *         - KEY_DOWN:    按下瞬间事件（按键刚被按下的时刻） - KEY_UP:      松开瞬间事件（按键刚被松开的时刻）
  *         - KEY_HOLD:    按住状态（按键持续按下的状态）
  *
  * @retval 1: 该状态标志被置位（事件发生）
  *         0: 该状态标志未置位（事件未发生）
  */
uint8_t Key_Check(uint8_t n, uint8_t Flag)
{
    /* 参数检查 */
    if (n >= KEY_COUNT) {
        return 0;
    }

    /* 检查指定按键的特定标志位 */
    if (Key_Flag[n] & Flag){
        /* 如果不是按住状态，则清除该标志位（一次性事件） */
        if (Flag != KEY_HOLD){
            Key_Flag[n] &= ~Flag;
        }
        return 1;  // 事件发生
    }
    return 0;  // 事件未发生
}

/**
  * @brief  按键状态检测函数(需要在定时器中断中调用)
  * @param  None
  * @retval None
  *
  * @note   必须在定时器中断中每1ms调用一次
  *         保持外部函数名不变以确保现有代码兼容
  */
void Key_Tick(void) {
	/* 静态变量 - 使用标准化命名但功能不变 */
	static uint8_t KeyIndex;                                    // 按键循环索引
	static uint8_t DebounceCounter;                             // 消抖计数器（20ms）
	static uint8_t CurrentKeyState[KEY_COUNT];                  // 当前按键物理状态
	static uint8_t PreviousKeyState[KEY_COUNT];                 // 上一次按键物理状态
	static uint8_t KeyStateMachine[KEY_COUNT];                  // 按键状态机状态
	static uint16_t KeyTimer[KEY_COUNT];                        // 按键事件计时器

	/* 所有按键计时器递减 */
	for (KeyIndex = 0; KeyIndex < KEY_COUNT; KeyIndex++) {
		if (KeyTimer[KeyIndex] > 0) {
			KeyTimer[KeyIndex]--;
		}
	}

	/* 每20ms执行一次按键扫描（软件消抖处理） */
	DebounceCounter++;
	if (DebounceCounter >= 20) {
		DebounceCounter = 0;

		/* 遍历所有按键进行状态检测 */
		for (KeyIndex = 0; KeyIndex < KEY_COUNT; KeyIndex++) {
			/* 更新按键状态历史记录 */
			PreviousKeyState[KeyIndex] = CurrentKeyState[KeyIndex];   // 保存上一次状态
			CurrentKeyState[KeyIndex] = Key_GetPhysicalState(KeyIndex); // 读取当前物理状态

			/* 更新按住状态标志 */
			if (CurrentKeyState[KeyIndex] == KEY_STATE_PRESSED) {
				Key_Flag[KeyIndex] |= KEY_HOLD;          // 设置按住状态标志
			} else {
				Key_Flag[KeyIndex] &= ~KEY_HOLD;         // 清除按住状态标志
			}

			/* 检测按下瞬间（下降沿检测） */
			if ((CurrentKeyState[KeyIndex] == KEY_STATE_PRESSED)
					&& (PreviousKeyState[KeyIndex] == KEY_STATE_RELEASED)) {
				Key_Flag[KeyIndex] |= KEY_DOWN;          // 设置按下瞬间事件标志
			}

			/* 检测松开瞬间（上升沿检测） */
			if ((CurrentKeyState[KeyIndex] == KEY_STATE_RELEASED)
					&& (PreviousKeyState[KeyIndex] == KEY_STATE_PRESSED)) {
				Key_Flag[KeyIndex] |= KEY_UP;            // 设置松开瞬间事件标志
			}

			/* ========== 状态机：检测复杂按键事件 ========== */
			switch (KeyStateMachine[KeyIndex]) {
			case 0: { // 状态0：等待按键按下
				if (CurrentKeyState[KeyIndex] == KEY_STATE_PRESSED) {
					KeyTimer[KeyIndex] = KEY_TIME_LONG;  // 启动长按计时器
					KeyStateMachine[KeyIndex] = 1;       // 转移到状态1
				}
			}
				break;

			case 1: { // 状态1：按键已按下，等待释放或长按超时
				if (CurrentKeyState[KeyIndex] == KEY_STATE_RELEASED) {
					KeyTimer[KeyIndex] = KEY_TIME_DOUBLE; // 启动双击检测计时
					KeyStateMachine[KeyIndex] = 2;        // 转移到状态2
				} else if (KeyTimer[KeyIndex] == 0) {
					KeyTimer[KeyIndex] = KEY_TIME_REPEAT; // 设置重复触发间隔
					Key_Flag[KeyIndex] |= KEY_LONG;       // 触发长按事件
					KeyStateMachine[KeyIndex] = 4;        // 转移到状态4
				}
			}
				break;

			case 2: { // 状态2：单击后等待，检测是否双击
				if (CurrentKeyState[KeyIndex] == KEY_STATE_PRESSED) {
					Key_Flag[KeyIndex] |= KEY_DOUBLE;     // 触发双击事件
					KeyStateMachine[KeyIndex] = 3;        // 转移到状态3
				} else if (KeyTimer[KeyIndex] == 0) {
					Key_Flag[KeyIndex] |= KEY_SINGLE;     // 触发单击事件
					KeyStateMachine[KeyIndex] = 0;        // 回到初始状态
				}
			}
				break;

			case 3: { // 状态3：双击后等待释放
				if (CurrentKeyState[KeyIndex] == KEY_STATE_RELEASED) {
					KeyStateMachine[KeyIndex] = 0;        // 回到初始状态
				}
			}
				break;

			case 4: { // 状态4：长按重复状态
				if (CurrentKeyState[KeyIndex] == KEY_STATE_RELEASED) {
					KeyStateMachine[KeyIndex] = 0;        // 回到初始状态
				} else if (KeyTimer[KeyIndex] == 0) {
					KeyTimer[KeyIndex] = KEY_TIME_REPEAT; // 重置重复计时器
					Key_Flag[KeyIndex] |= KEY_REPEAT;     // 触发重复事件
					KeyStateMachine[KeyIndex] = 4;        // 保持重复状态
				}
			}
				break;
			}  // switch状态机结束
		}      // for按键循环结束
	}          // if消抖计时结束
}		       // Key_Tick函数结束
