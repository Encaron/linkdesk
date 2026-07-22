/// Phase 5h Step 2：plugin:// 自定义协议。
/// 将 `plugin://<id>/<path>` 映射到 `plugins/<id>/<path>` 文件系统路径。
/// 对标 VS Code 的 `vscode-file://` 协议——让 WebView 能动态加载插件 bundle。
///
/// 安全：路径穿越防护——canonicalize 后验证前缀在 plugins/ 下。
/// 设计依据：docs/phase5_应用基础设施/V3-Phase5h-运行时动态加载-设计.md §Step 2

use std::path::PathBuf;

/// 解析 plugins/ 目录路径（和 plugins.rs 复用的逻辑）。
/// dev 模式：<project>/plugins，打包后由 Tauri resource_dir 决定。
fn plugins_root() -> Result<PathBuf, String> {
    if let Ok(cwd) = std::env::current_dir() {
        let dev_path = cwd.join("../plugins");
        if dev_path.exists() {
            return Ok(dev_path);
        }
    }
    // 打包后：当前目录下的 plugins/
    if let Ok(cwd) = std::env::current_dir() {
        let pkg_path = cwd.join("plugins");
        if pkg_path.exists() {
            return Ok(pkg_path);
        }
    }
    Err("plugins 目录未找到".into())
}

/// 根据 URI 查询返回 MIME 类型。
fn mime_for_path(path: &str) -> &'static str {
    if path.ends_with(".js") || path.ends_with(".mjs") {
        "text/javascript; charset=utf-8"
    } else if path.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if path.ends_with(".json") {
        "application/json; charset=utf-8"
    } else if path.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if path.ends_with(".svg") {
        "image/svg+xml"
    } else if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".woff2") {
        "font/woff2"
    } else {
        "application/octet-stream"
    }
}

/// plugin:// 协议处理器。
/// URI 格式：plugin://<plugin_id>/<relative_path>
/// 示例：plugin://terminal/dist/index.js → plugins/terminal/dist/index.js
pub fn handle_plugin_protocol(uri: &str) -> Result<(Vec<u8>, String), Box<dyn std::error::Error>> {
    // 解析 URI：plugin://<plugin_id>/<path>
    let path = uri
        .strip_prefix("plugin://")
        .ok_or("不是 plugin:// URI")?;

    // 不允许空路径或根路径
    if path.is_empty() || path == "/" {
        return Err("空路径".into());
    }

    let path = path.trim_start_matches('/');

    // 构建文件系统路径
    let root = plugins_root()?;
    let fs_path = root.join(path);

    // 安全检查：canonicalize 后验证前缀
    let canonical = fs_path.canonicalize().map_err(|e| {
        format!("文件不存在或无法访问: {} ({})", fs_path.display(), e)
    })?;

    let canonical_root = root.canonicalize().map_err(|e| {
        format!("plugins 目录无法 canon: {}", e)
    })?;

    if !canonical.starts_with(&canonical_root) {
        return Err(format!(
            "路径穿越被拒绝: {} (canon={}) 不在 {} 下",
            fs_path.display(),
            canonical.display(),
            canonical_root.display()
        ).into());
    }

    // 读取文件
    let data = std::fs::read(&canonical)
        .map_err(|e| format!("读取文件失败 {}: {}", canonical.display(), e))?;

    let mime = mime_for_path(path);

    Ok((data, mime.to_string()))
}
