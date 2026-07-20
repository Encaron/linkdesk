use serialport::SerialPort;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// 串口内部状态
pub(crate) struct SerialInner {
    port: Option<Box<dyn SerialPort>>,
    line_buffer: Vec<u8>,
    is_closing: bool,
    /// 接收编码——Phase 5e：从 open_port 传入，read_loop 解码用
    encoding: String,
}

/// 线程间共享的串口状态
pub type SerialState = Arc<Mutex<SerialInner>>;

/// 创建初始状态
pub fn create_state() -> SerialState {
    Arc::new(Mutex::new(SerialInner {
        port: None,
        line_buffer: Vec::new(),
        is_closing: false,
        encoding: "UTF-8".into(),
    }))
}

#[derive(Clone, serde::Serialize)]
pub struct PortInfo {
    pub name: String,
    pub description: String,
}

// ---- Tauri 命令 ----

/// 枚举可用串口
#[tauri::command]
pub fn list_ports() -> Vec<PortInfo> {
    serialport::available_ports()
        .unwrap_or_default()
        .into_iter()
        .map(|p| PortInfo {
            name: p.port_name,
            description: format!("{:?}", p.port_type),
        })
        .collect()
}

/// 打开串口 + 启动读线程
/// Phase 5e：encoding 参数——read_loop 用指定编码解码接收字节（UTF-8 / GBK / Shift-JIS / Latin-1）
#[tauri::command]
pub fn open_port(
    state: tauri::State<'_, SerialState>,
    app: AppHandle,
    port_name: String,
    baud_rate: u32,
    data_bits: Option<u8>,
    stop_bits: Option<u8>,
    parity: Option<String>,
    encoding: Option<String>,
) -> Result<(), String> {
    use serialport::{DataBits, StopBits, Parity};

    let mut inner = state.lock().map_err(|e| e.to_string())?;

    // 如果已打开，先关闭
    if inner.port.is_some() {
        inner.is_closing = true;
        drop(inner);
        // 等读线程退出
        thread::sleep(Duration::from_millis(50));
        inner = state.lock().map_err(|e| e.to_string())?;
        inner.is_closing = false;
        inner.port = None;
    }

    let data = match data_bits.unwrap_or(8) {
        5 => DataBits::Five, 6 => DataBits::Six, 7 => DataBits::Seven, _ => DataBits::Eight,
    };
    let stop = match stop_bits.unwrap_or(1) {
        2 => StopBits::Two, _ => StopBits::One,
    };
    let par = match parity.as_deref().unwrap_or("None") {
        "Even" => Parity::Even, "Odd" => Parity::Odd, _ => Parity::None,
    };

    let app_for_err = app.clone();
    let port = serialport::new(&port_name, baud_rate)
        .data_bits(data)
        .stop_bits(stop)
        .parity(par)
        .timeout(Duration::from_millis(100))
        .open()
        .map_err(move |e| {
            let msg = format!("串口打开失败：{}", e);
            let _ = app_for_err.emit("serial-system", &msg);
            msg
        })?;

    // 清空硬件输入缓冲区——丢弃闭口期间积累的陈旧数据
    let _ = port.clear(serialport::ClearBuffer::Input);

    inner.port = Some(port);
    inner.line_buffer.clear();
    inner.is_closing = false;
    inner.encoding = encoding.unwrap_or_else(|| "UTF-8".into());

    // 启动读线程
    let state_clone = Arc::clone(state.inner());
    let app_reader = app.clone();
    thread::spawn(move || read_loop(state_clone, app_reader));

    // 系统消息（V2 格式：---- 已打开串行端口 COM3 ----）
    let _ = app.emit("serial-system", format!("---- 已打开串行端口 {} ----", port_name));

    Ok(())
}

/// 关闭串口
#[tauri::command]
pub fn close_port(state: tauri::State<'_, SerialState>, app: AppHandle) -> Result<(), String> {
    let mut inner = state.lock().map_err(|e| e.to_string())?;

    if inner.port.is_none() {
        return Ok(()); // 已关闭，不重复 emit
    }

    let port_name = inner.port.as_ref().map(|p| p.name().unwrap_or_default().to_string()).unwrap_or_default();

    inner.is_closing = true;

    // 冲刷硬件缓冲区残留
    if let Some(ref mut port) = inner.port {
        let _ = port.flush();
    }

    // 冲刷行缓冲区残留——在关闭消息之前 emit，保证数据在关闭消息之上
    if !inner.line_buffer.is_empty() {
        let encoding = inner.encoding.clone();
        let residual = decode_bytes(&inner.line_buffer, &encoding);
        inner.line_buffer.clear();
        drop(inner);
        let residual = residual.trim().to_string();
        if !residual.is_empty() {
            let _ = app.emit("serial-data", residual);
        }
        inner = state.lock().map_err(|e| e.to_string())?;
        inner.is_closing = true;
    }

    inner.port = None;
    inner.is_closing = false;
    inner.line_buffer.clear();

    let _ = app.emit("serial-system", format!("---- 关闭串行端口 {} ----", port_name));

    Ok(())
}

/// 发送字节数据
#[tauri::command]
pub fn send_data(state: tauri::State<'_, SerialState>, data: Vec<u8>, app: AppHandle) -> Result<usize, String> {
    let mut inner = state.lock().map_err(|e| e.to_string())?;
    match inner.port.as_mut() {
        Some(port) => {
            let written = port.write(&data).map_err(|e| format!("发送失败: {}", e))?;
            let _ = app.emit("serial-stats", serde_json::json!({ "tx": written }));
            Ok(written)
        }
        None => Err("串口未打开".into()),
    }
}

/// 设置 DTR 信号
#[tauri::command]
pub fn set_dtr(state: tauri::State<'_, SerialState>, enable: bool) -> Result<(), String> {
    let mut inner = state.lock().map_err(|e| e.to_string())?;
    match inner.port.as_mut() {
        Some(port) => port
            .write_data_terminal_ready(enable)
            .map_err(|e| format!("设置 DTR 失败: {}", e)),
        None => Err("串口未打开".into()),
    }
}

/// 发送文本（支持编码）
#[tauri::command]
pub fn send_text(
    state: tauri::State<'_, SerialState>,
    text: String,
    encoding: String,
    app: AppHandle,
) -> Result<usize, String> {
    let bytes: Vec<u8> = match encoding.as_str() {
        "GBK" | "GB2312" => {
            use encoding_rs::GBK;
            let (encoded, _, _) = GBK.encode(&text);
            encoded.into_owned()
        }
        "Shift-JIS" => {
            use encoding_rs::SHIFT_JIS;
            let (encoded, _, _) = SHIFT_JIS.encode(&text);
            encoded.into_owned()
        }
        _ => {
            // UTF-8 / Latin-1 → UTF-8 编码（Latin-1 是 UTF-8 的 ASCII 子集）
            text.into_bytes()
        }
    };
    let mut inner = state.lock().map_err(|e| e.to_string())?;
    match inner.port.as_mut() {
        Some(port) => {
            let written = port.write(&bytes).map_err(|e| format!("发送失败: {}", e))?;
            let _ = app.emit("serial-stats", serde_json::json!({ "tx": written }));
            Ok(written)
        }
        None => Err("串口未打开".into()),
    }
}

/// 设置 RTS 信号
#[tauri::command]
pub fn set_rts(state: tauri::State<'_, SerialState>, enable: bool) -> Result<(), String> {
    let mut inner = state.lock().map_err(|e| e.to_string())?;
    match inner.port.as_mut() {
        Some(port) => port
            .write_request_to_send(enable)
            .map_err(|e| format!("设置 RTS 失败: {}", e)),
        None => Err("串口未打开".into()),
    }
}

// ---- 读线程 ----

/// 解码字节为字符串——根据 encoding 选择解码器。
/// "UTF-8" / "ASCII" / "Latin-1" → from_utf8_lossy（ASCII/Latin-1 是 UTF-8 子集）
/// "GBK" / "GB2312" → encoding_rs::GBK
/// "Shift-JIS" → encoding_rs::SHIFT_JIS
fn decode_bytes(bytes: &[u8], encoding: &str) -> String {
    match encoding {
        "GBK" | "GB2312" => {
            use encoding_rs::GBK;
            let (decoded, _, _) = GBK.decode(bytes);
            decoded.into_owned()
        }
        "Shift-JIS" => {
            use encoding_rs::SHIFT_JIS;
            let (decoded, _, _) = SHIFT_JIS.decode(bytes);
            decoded.into_owned()
        }
        _ => {
            // UTF-8 / ASCII / Latin-1 → lossy UTF-8 兜底
            String::from_utf8_lossy(bytes).to_string()
        }
    }
}

fn read_loop(state: SerialState, app: AppHandle) {
    let mut buf = [0u8; 256];

    loop {
        // 检查是否正在关闭 + 读取当前编码
        {
            let inner = match state.lock() {
                Ok(i) => i,
                Err(_) => return,
            };
            if inner.is_closing || inner.port.is_none() {
                return;
            }
        }

        // 读数据（100ms 超时）
        let n = {
            let mut inner = match state.lock() {
                Ok(i) => i,
                Err(_) => return,
            };
            match inner.port.as_mut() {
                Some(port) => match port.read(&mut buf) {
                    Ok(0) | Err(_) => {
                        // 超时或无数据：冲刷行缓冲区残留
                        if !inner.line_buffer.is_empty() {
                            let encoding = inner.encoding.clone();
                            let text = decode_bytes(&inner.line_buffer, &encoding).trim().to_string();
                            inner.line_buffer.clear();
                            drop(inner);
                            if !text.is_empty() {
                                let _ = app.emit("serial-data", text);
                            }
                        }
                        continue;
                    }
                    Ok(n) => {
                        let _ = app.emit("serial-stats", serde_json::json!({ "rx": n }));
                        n
                    }
                },
                None => return,
            }
        };

        // 拼入行缓冲区
        {
            let mut inner = match state.lock() {
                Ok(i) => i,
                Err(_) => return,
            };
            inner.line_buffer.extend_from_slice(&buf[..n]);
        }

        // 按 \n 拆行并 emit
        loop {
            let line = {
                let mut inner = match state.lock() {
                    Ok(i) => i,
                    Err(_) => return,
                };
                if let Some(nl_pos) = inner.line_buffer.iter().position(|&b| b == b'\n') {
                    let line = inner.line_buffer[..=nl_pos].to_vec();
                    inner.line_buffer.drain(..=nl_pos);
                    decode_bytes(&line, &inner.encoding)
                } else {
                    break;
                }
            };

            let trimmed = line.trim().to_string();
            if !trimmed.is_empty() {
                let _ = app.emit("serial-data", trimmed);
            }
        }
    }
}
