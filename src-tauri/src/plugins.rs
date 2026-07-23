/// Phase 4 插件管理命令。
/// P1-5 文件监听 + 安装/卸载/禁用生命周期。
/// 设计依据：memory phase4-remaining.md + phase4-design-decisions.md

use std::fs;
use std::path::PathBuf;

/// 解析 plugins/ 目录路径。
/// 优先级：current_dir/../plugins（tauri dev 模式）→ 资源目录（打包后）
fn plugins_dir() -> Result<PathBuf, String> {
    // dev 模式：current_dir = <project>/src-tauri → ../plugins = <project>/plugins
    if let Ok(cwd) = std::env::current_dir() {
        let dev_path = cwd.join("../plugins");
        if dev_path.exists() {
            return Ok(dev_path);
        }
    }
    Err("plugins 目录未找到".into())
}

/// 列出 plugins/ 下所有子目录名（排除 .disabled 和以 . 开头的隐藏目录）。
#[tauri::command]
pub fn list_plugin_dirs() -> Result<Vec<String>, String> {
    let dir = plugins_dir()?;
    let mut names: Vec<String> = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("读取 plugins/ 失败: {}", e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("遍历条目失败: {}", e))?;
        let ftype = entry.file_type().map_err(|e| format!("获取文件类型失败: {}", e))?;
        if ftype.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            // 检查是否有 plugin.json
            let manifest = entry.path().join("plugin.json");
            if manifest.exists() {
                names.push(name);
            }
        }
    }
    names.sort();
    Ok(names)
}

/// 安装插件：将源目录复制到 plugins/<dir_name>/。
/// source 可以是插件文件夹路径或 .v3p 文件路径（Phase 4 仅支持文件夹）。
#[tauri::command]
pub fn install_plugin(source: String) -> Result<String, String> {
    let src = PathBuf::from(&source);
    if !src.exists() {
        return Err(format!("源路径不存在: {}", source));
    }

    let name = src
        .file_name()
        .ok_or("无法解析目录名")?
        .to_string_lossy()
        .to_string();

    // 校验 plugin.json
    let manifest = src.join("plugin.json");
    if !manifest.exists() {
        return Err(format!("不是有效插件（缺少 plugin.json）: {}", source));
    }
    // 读取并校验 JSON
    let raw = fs::read_to_string(&manifest)
        .map_err(|e| format!("读取 plugin.json 失败: {}", e))?;
    serde_json::from_str::<serde_json::Value>(&raw)
        .map_err(|e| format!("plugin.json 格式错误: {}", e))?;

    let dest_dir = plugins_dir()?.join(&name);
    if dest_dir.exists() {
        return Err(format!("插件 \"{}\" 已存在。请先卸载旧版本。", name));
    }

    copy_dir(&src, &dest_dir)?;
    Ok(name)
}

/// 卸载插件：将 plugins/<id>/ 移到 plugins/.disabled/<id>/。
/// core 插件不可卸载。
#[tauri::command]
pub fn uninstall_plugin(plugin_id: String) -> Result<(), String> {
    let dir = plugins_dir()?;
    let src = dir.join(&plugin_id);
    if !src.exists() {
        return Err(format!("插件 \"{}\" 不存在", plugin_id));
    }

    // 检查是否 core 插件
    let manifest = src.join("plugin.json");
    if manifest.exists() {
        let raw = fs::read_to_string(&manifest)
            .map_err(|e| format!("读取 plugin.json 失败: {}", e))?;
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) {
            if json.get("core").and_then(|v| v.as_bool()).unwrap_or(false) {
                return Err(format!("核心插件 \"{}\" 不可卸载", plugin_id));
            }
        }
    }

    let disabled_dir = dir.join(".disabled");
    fs::create_dir_all(&disabled_dir)
        .map_err(|e| format!("创建 .disabled/ 失败: {}", e))?;

    let dest = disabled_dir.join(&plugin_id);
    if dest.exists() {
        fs::remove_dir_all(&dest)
            .map_err(|e| format!("清理旧 .disabled/{} 失败: {}", plugin_id, e))?;
    }

    fs::rename(&src, &dest)
        .map_err(|e| format!("移到 .disabled/ 失败: {}", e))?;

    Ok(())
}

/// 列出 plugins/.disabled/ 下所有子目录名（已卸载但仍保留文件的插件）。
/// VS Code 对标：extensions 目录中已删除但仍可在本地重新安装的扩展。
#[tauri::command]
pub fn list_disabled_plugin_dirs() -> Result<Vec<String>, String> {
    let dir = plugins_dir()?.join(".disabled");
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut names: Vec<String> = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("读取 .disabled/ 失败: {}", e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("遍历条目失败: {}", e))?;
        if entry.file_type().map_err(|e| format!("获取文件类型失败: {}", e))?.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with('.') {
                let manifest = entry.path().join("plugin.json");
                if manifest.exists() {
                    names.push(name);
                }
            }
        }
    }
    names.sort();
    Ok(names)
}

/// 重新安装：将 plugins/.disabled/<id>/ 移回 plugins/<id>/。
/// 对标 VS Code：从本地重新安装已卸载的扩展（无需重新下载）。
#[tauri::command]
pub fn reinstall_plugin(plugin_id: String) -> Result<(), String> {
    let dir = plugins_dir()?;
    let disabled_dir = dir.join(".disabled");
    let src = disabled_dir.join(&plugin_id);
    if !src.exists() {
        return Err(format!("已卸载的插件 \"{}\" 未找到", plugin_id));
    }
    let dest = dir.join(&plugin_id);
    if dest.exists() {
        return Err(format!("插件 \"{}\" 已存在", plugin_id));
    }
    fs::rename(&src, &dest)
        .map_err(|e| format!("重新安装失败: {}", e))?;
    Ok(())
}

/// 从文件系统读取插件的 plugin.json 内容。
/// 用于重装不在 glob 中的插件（如 .disabled/ 里的插件构建时 glob 未扫描）。
#[tauri::command]
pub fn read_plugin_manifest(plugin_id: String) -> Result<String, String> {
    let manifest_path = plugins_dir()?.join(&plugin_id).join("plugin.json");
    if !manifest_path.exists() {
        return Err(format!("插件 \"{}\" 的 plugin.json 不存在", plugin_id));
    }
    fs::read_to_string(&manifest_path)
        .map_err(|e| format!("读取 plugin.json 失败: {}", e))
}

/// 返回插件目录的绝对路径。
/// 用于动态 import——前端通过 Vite /@fs/ 协议加载插件入口文件（支持 .tsx 实时编译）。
#[tauri::command]
pub fn resolve_plugin_path(plugin_id: String) -> Result<String, String> {
    let path = plugins_dir()?.join(&plugin_id);
    // 转换为正斜杠——Windows 反斜杠在 Vite /@fs/ URL 中不兼容
    Ok(path.to_string_lossy().replace('\\', "/"))
}

/// 递归复制目录。
fn copy_dir(src: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    fs::create_dir_all(dest)
        .map_err(|e| format!("创建目标目录失败: {}", e))?;

    let entries = fs::read_dir(src)
        .map_err(|e| format!("读取源目录失败: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("遍历失败: {}", e))?;
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());

        if src_path.is_dir() {
            copy_dir(&src_path, &dest_path)?;
        } else {
            fs::copy(&src_path, &dest_path)
                .map_err(|e| format!("复制文件失败 {:?}: {}", src_path, e))?;
        }
    }
    Ok(())
}
