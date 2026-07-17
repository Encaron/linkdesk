/**
 * 按键测试处理 —— 支持协议包和纯文本两种格式
 *
 * 协议包格式: [key,名称,状态]    例: [key,on,on]  [key,off,off]
 * 纯文本格式: on\r\n  /  off\r\n
 *
 * 注意：底层 SQUARE_BRACKET 协议已剥离 [ ]，raw 不含括号
 *       raw 由 Test_Handle 统一获取后传入，本模块不重复调 GetRxFlag
 *
 * 回复格式: "按键[on] on，当前格式：数据包"
 */
#include "../Protocols/test_protocols.h"

void Test_KeyProcess(const char *raw)
{
    if (!raw || raw[0] == '\0') return;

    const char *format;       // "文本" 或 "数据包"
    const char *action;       // "on" 或 "off"
    const char *key_name;     // 按键名称
    int execute_on = 0;       // 1=按下, 0=松开

    // 先取字段0判断类型
    char type[16], name[32], state[16];
    GetField(raw, type, 0, sizeof(type));

    // ── 分支 1: 协议包格式 key,名称,状态 ──
    if (strcmp(type, "key") == 0)
    {
        GetField(raw, name,  1, sizeof(name));
        GetField(raw, state, 2, sizeof(state));

        key_name = name;

        if (strcmp(state, "on") == 0)
        {
            execute_on = 1;
            action = "on";
        }
        else if (strcmp(state, "off") == 0)
        {
            execute_on = 0;
            action = "off";
        }
        else
        {
            return;  // 未知状态，忽略
        }

        format = "数据包";
    }
    // ── 分支 2: 纯文本格式 on / off ──
    else
    {
        // 去掉末尾 \r \n
        char buf[64];
        strncpy(buf, raw, sizeof(buf) - 1);
        buf[sizeof(buf) - 1] = '\0';
        char *p = buf + strlen(buf) - 1;
        while (p >= buf && (*p == '\r' || *p == '\n'))
            *p-- = '\0';

        if (strcmp(buf, "on") == 0)
        {
            execute_on = 1;
            action = "on";
        }
        else if (strcmp(buf, "off") == 0)
        {
            execute_on = 0;
            action = "off";
        }
        else
        {
            return;  // 不认识的文本，忽略
        }

        key_name = "(text)";
        format = "文本";
    }

    // ── 纯串口测试，不做硬件操作 ──
    (void)execute_on;

    // ── 回复确认 ──
    Log("按键[%s] %s，当前格式：%s\r\n", key_name, action, format);
}
