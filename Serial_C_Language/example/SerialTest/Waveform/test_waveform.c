/*
 * test_waveform.c
 *
 * 波形发生器 —— 9 种测试波形
 * 每步相位递增 0.1 rad，建议每 50ms 调用一次 (≈20Hz)
 */
#include "test_waveform.h"
#include "../Protocols/test_protocols.h"
#include <math.h>

static int   wf_mode = WAVEFORM_SIN;
static float wf_x    = 0.0f;

void Test_WaveformInit(int mode)
{
    wf_mode = mode;
    wf_x    = 0.0f;

    const char *names[] = {
        "sin", "square", "tri", "saw", "am",
        "mixed", "noise", "damped", "burst"
    };
    Log("---- 波形发生器: %s ----\r\n",
        (mode >= 0 && mode <= 8) ? names[mode] : "sin");
}

void Test_WaveformProcess(void)
{
    float y1, y2;

    switch (wf_mode) {

    case WAVEFORM_SIN:
        y1 = sinf(wf_x);
        y2 = cosf(wf_x);
        Log("[plot,sin,%f][plot,cos,%f]\r\n", y1, y2);
        break;

    case WAVEFORM_SQUARE:
        y1 = sinf(wf_x) >= 0 ? 1.0f : -1.0f;
        y2 = cosf(wf_x) >= 0 ? 1.0f : -1.0f;
        Log("[plot,square,%f][plot,quad,%f]\r\n", y1, y2);
        break;

    case WAVEFORM_TRI:
        {
            float p = fmodf(wf_x, 2.0f * 3.14159265f) / (2.0f * 3.14159265f);
            y1 = 2.0f * (p < 0.5f ? 2.0f * p : 2.0f * (1.0f - p)) - 1.0f;
            p = fmodf(wf_x + 1.57079633f, 2.0f * 3.14159265f) / (2.0f * 3.14159265f);
            y2 = 2.0f * (p < 0.5f ? 2.0f * p : 2.0f * (1.0f - p)) - 1.0f;
            Log("[plot,tri,%f][plot,tri90,%f]\r\n", y1, y2);
        }
        break;

    case WAVEFORM_SAW:
        {
            float p = fmodf(wf_x, 2.0f * 3.14159265f) / (2.0f * 3.14159265f);
            y1 = 2.0f * p - 1.0f;
            y2 = 2.0f * (1.0f - p) - 1.0f;
            Log("[plot,saw,%f][plot,rsaw,%f]\r\n", y1, y2);
        }
        break;

    case WAVEFORM_AM:
        y1 = sinf(wf_x) * sinf(wf_x * 0.04f);
        y2 = sinf(wf_x) * sinf(wf_x * 0.08f);
        Log("[plot,am1,%f][plot,am2,%f]\r\n", y1, y2);
        break;

    case WAVEFORM_MIXED:
        y1 = sinf(wf_x) + 0.333f * sinf(3.0f * wf_x);
        y2 = sinf(wf_x) + 0.333f * sinf(3.0f * wf_x) + 0.2f * sinf(5.0f * wf_x);
        Log("[plot,mixed1,%f][plot,mixed2,%f]\r\n", y1, y2);
        break;

    case WAVEFORM_NOISE:
        {
            float noise = sinf(wf_x * 97.37f) * sinf(wf_x * 53.17f) * 0.2f;
            y1 = sinf(wf_x) + noise;
            y2 = cosf(wf_x) + noise * 0.5f;
            Log("[plot,noisy_sin,%f][plot,noisy_cos,%f]\r\n", y1, y2);
        }
        break;

    case WAVEFORM_DAMPED:
        {
            float t = fmodf(wf_x * 0.2f, 20.0f * 3.14159265f);
            float env = expf(-t * 0.05f);
            y1 = env * sinf(t * 2.0f);
            y2 = env * cosf(t * 2.0f);
            Log("[plot,damped_sin,%f][plot,damped_cos,%f]\r\n", y1, y2);
        }
        break;

    case WAVEFORM_BURST:
        {
            float T = 40.0f;
            float duty = 0.3f;
            float phase = fmodf(wf_x, T) / T;
            float carrier = sinf(wf_x * 1.5f);
            y1 = (phase < duty) ? carrier : 0.0f;
            y2 = (phase >= duty * 0.5f && phase < duty * 1.5f) ? carrier : 0.0f;
            Log("[plot,burst1,%f][plot,burst2,%f]\r\n", y1, y2);
        }
        break;

    default:
        y1 = sinf(wf_x);
        y2 = cosf(wf_x);
        Log("[plot,sin,%f][plot,cos,%f]\r\n", y1, y2);
        break;
    }

    wf_x += 0.1f;
}
