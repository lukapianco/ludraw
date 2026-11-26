//! Declara os comandos do app: assim cada um exige permissão explícita (`capabilities/chooser.json`).
fn main() {
    println!("cargo:rerun-if-changed=generated/headers.json");
    let manifest = tauri_build::AppManifest::new().commands(&[
        "desktop_state",
        "desktop_use_local",
        "desktop_use_server",
        "desktop_probe_port",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest)).expect("tauri-build");
}
