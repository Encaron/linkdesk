mod serial;
mod plugins;
mod plugin_protocol;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        // Phase 5h Step 2：plugin:// 协议——让 WebView 动态加载插件 bundle
        .register_asynchronous_uri_scheme_protocol("plugin", move |_app, request, responder| {
            let uri = request.uri().to_string();
            match plugin_protocol::handle_plugin_protocol(&uri) {
                Ok((data, mime)) => {
                    let response = tauri::http::Response::builder()
                        .status(200)
                        .header("Content-Type", mime)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(data)
                        .unwrap();
                    responder.respond(response);
                }
                Err(e) => {
                    let msg = format!("plugin:// 协议错误: {}", e);
                    let response = tauri::http::Response::builder()
                        .status(404)
                        .header("Content-Type", "text/plain; charset=utf-8")
                        .body(msg.into_bytes())
                        .unwrap();
                    responder.respond(response);
                }
            }
        })
        .manage(serial::create_state())
        .invoke_handler(tauri::generate_handler![
            serial::list_ports,
            serial::get_serial_status,
            serial::open_port,
            serial::close_port,
            serial::send_data,
            serial::send_text,
            serial::set_dtr,
            serial::set_rts,
            plugins::list_plugin_dirs,
            plugins::list_disabled_plugin_dirs,
            plugins::install_plugin,
            plugins::uninstall_plugin,
            plugins::reinstall_plugin,
            plugins::read_plugin_manifest,
            plugins::resolve_plugin_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
