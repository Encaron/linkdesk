mod serial;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(serial::create_state())
        .invoke_handler(tauri::generate_handler![
            serial::list_ports,
            serial::open_port,
            serial::close_port,
            serial::send_data,
            serial::send_text,
            serial::set_dtr,
            serial::set_rts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
