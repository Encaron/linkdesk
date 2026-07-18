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
}

/// 线程间共享的串口状态
pub type SerialState = Arc<Mutex<SerialInner>>;

/// 创建初始状态
pub fn create_state() -> SerialState {
    Arc::new(Mutex::new(SerialInner {
        port: None,
        line_buffer: Vec::new(),
        is_closing: false,
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
#[tauri::command]
pub fn open_port(
    state: tauri::State<'_, SerialState>,
    app: AppHandle,
    port_name: String,
    baud_rate: u32,
) -> Result<(), String> {
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

    let port = serialport::new(&port_name, baud_rate)
        .timeout(Duration::from_millis(100))
        .open()
        .map_err(|e| format!("打开串口失败: {}", e))?;

    inner.port = Some(port);
    inner.line_buffer.clear();
    inner.is_closing = false;

    // 启动读线程
    let state_clone = Arc::clone(state.inner());
    thread::spawn(move || read_loop(state_clone, app));

    Ok(())
}

/// 关闭串口
#[tauri::command]
pub fn close_port(state: tauri::State<'_, SerialState>) -> Result<(), String> {
    let mut inner = state.lock().map_err(|e| e.to_string())?;
    inner.is_closing = true;

    if let Some(ref mut port) = inner.port {
        // 冲刷残留数据
        let _ = port.flush();
    }

    inner.port = None;
    inner.is_closing = false;
    inner.line_buffer.clear();

    Ok(())
}

/// 发送字节数据
#[tauri::command]
pub fn send_data(state: tauri::State<'_, SerialState>, data: Vec<u8>) -> Result<usize, String> {
    let mut inner = state.lock().map_err(|e| e.to_string())?;
    match inner.port.as_mut() {
        Some(port) => port.write(&data).map_err(|e| format!("发送失败: {}", e)),
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

fn read_loop(state: SerialState, app: AppHandle) {
    let mut buf = [0u8; 256];

    loop {
        // 检查是否正在关闭
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
                            let text = String::from_utf8_lossy(&inner.line_buffer).to_string();
                            inner.line_buffer.clear();
                            drop(inner);
                            let _ = app.emit("serial-data", text);
                        }
                        continue;
                    }
                    Ok(n) => n,
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
                    String::from_utf8_lossy(&line).to_string()
                } else {
                    break;
                }
            };

            let _ = app.emit("serial-data", line.trim_end_matches('\n').trim_end_matches('\r').to_string());
        }
    }
}
