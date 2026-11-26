//! Abre um endereço no programa do sistema (navegador ou e-mail). Só o que `nav::openable_outside` aceita.

use tauri::Url;

use crate::nav;

pub fn open(url: &Url) {
    if !nav::openable_outside(url) {
        return;
    }
    #[cfg(debug_assertions)]
    if crate::testing::record_external(url) {
        return;
    }
    launch(url.as_str());
}

#[cfg(windows)]
fn launch(address: &str) {
    use windows::{
        core::{w, HSTRING},
        Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
    };
    // SAFETY: chamada simples do Windows com textos válidos durante a chamada; o endereço já foi conferido
    // (http, https ou mailto), então nunca é um caminho de arquivo nem outro protocolo.
    unsafe {
        ShellExecuteW(None, w!("open"), &HSTRING::from(address), None, None, SW_SHOWNORMAL);
    }
}

#[cfg(not(windows))]
fn launch(address: &str) {
    // argumento único, sem shell; a espera roda noutra linha para não deixar processo órfão
    if let Ok(mut child) = std::process::Command::new("xdg-open").arg(address).spawn() {
        std::thread::spawn(move || child.wait());
    }
}
