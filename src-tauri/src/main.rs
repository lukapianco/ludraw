//! LuDraw — aplicativo desktop (Chat 09.1 · R7).
//!
//! Duas janelas (nunca abertas ao mesmo tempo para a pessoa):
//!  - `chooser`: documento local `desktop`, a tela "onde trabalhar". É a ÚNICA com permissão na ponte do Tauri.
//!  - `board`: o app do Modo Local (arquivos embutidos) ou o app servido pelo servidor. Sem permissão nenhuma — no
//!    Windows o objeto da ponte aparece até dentro dos quadros isolados das extensões, então quem protege é a
//!    permissão por janela, e não a ausência do objeto.
//!
//! Dois caminhos de dados, não três: Modo Local = origem local; Modo Servidor = a janela navega até o servidor.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod choice;
mod external;
mod headers;
mod nav;
mod probe;
mod single;
#[cfg(debug_assertions)]
mod testing;
mod text;

use std::{
    path::PathBuf,
    sync::mpsc,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::{Duration, Instant},
};

use choice::{Choice, Place};
use nav::{NewWindow, Target, Verdict};
use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    webview::{DownloadEvent, NewWindowResponse},
    AppHandle, Manager, Url, Webview, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

const CHOOSER: &str = "chooser";
/// Nome fixo: no Linux o tratador de downloads fica preso ao nome da janela que o criou (ver `open_window`).
const BOARD: &str = "board";
const TITLE: &str = "LuDraw";
/// Ao fechar uma janela de board: de quanto em quanto tempo perguntar se o app terminou de gravar, e o teto da espera.
const LEAVE_STEP: Duration = Duration::from_millis(100);
const LEAVE_MAX: Duration = Duration::from_secs(10);
/// Quantas gravações faltam na página (`src/utils/pendingSaves.ts`). Página sem o contador = nada a esperar.
const PENDING_SAVES: &str = "(()=>{try{const f=window.__ludrawPendingSaves;return typeof f==='function'?Number(f())||0:0}catch(e){return 0}})()";

struct Shell {
    dir: PathBuf,
    choice: Mutex<Choice>,
    /// A próxima tela de escolha segue sozinha para o servidor lembrado? (só na abertura do programa)
    auto: AtomicBool,
}

impl Shell {
    fn choice(&self) -> Choice {
        self.choice.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    fn lang(&self) -> String {
        self.choice().lang.unwrap_or_else(text::system_lang)
    }

    fn remember(&self, place: Place, lang: Option<String>) -> Result<(), String> {
        let mut choice = self.choice.lock().unwrap_or_else(|e| e.into_inner());
        choice.place = Some(place);
        choice.lang = lang.as_deref().and_then(choice::clean_lang).or(choice.lang.take());
        choice.save(&self.dir).map_err(|_| "save-failed".to_string())
    }
}

/* ------------------------------------------------ comandos (só a janela de escolha) ------------------------------------------------ */

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct State {
    version: String,
    place: Option<Place>,
    auto: bool,
}

/// 2ª barreira (a 1ª é a permissão por janela): o pedido veio da janela de escolha, no documento local `desktop`?
fn guard(window: &WebviewWindow) -> Result<(), String> {
    let ok = window.label() == CHOOSER && window.url().is_ok_and(|u| nav::is_chooser_document(&u));
    ok.then_some(()).ok_or_else(|| "not-allowed".to_string())
}

#[tauri::command]
async fn desktop_state(app: AppHandle, window: WebviewWindow) -> Result<State, String> {
    guard(&window)?;
    let shell = app.state::<Shell>();
    Ok(State {
        version: app.package_info().version.to_string(),
        place: shell.choice().place,
        auto: shell.auto.swap(false, Ordering::SeqCst),
    })
}

#[tauri::command]
async fn desktop_use_local(app: AppHandle, window: WebviewWindow, lang: Option<String>) -> Result<(), String> {
    guard(&window)?;
    app.state::<Shell>().remember(Place::Local, lang)?;
    open_board(&app, Target::Local, WebviewUrl::App("index.html".into())).map_err(|_| "window-failed".to_string())?;
    let _ = window.destroy();
    Ok(())
}

#[tauri::command]
async fn desktop_use_server(
    app: AppHandle,
    window: WebviewWindow,
    url: String,
    sso: Option<String>,
    lang: Option<String>,
) -> Result<(), String> {
    guard(&window)?;
    let url = nav::server_url(&url).ok_or_else(|| "bad-url".to_string())?;
    let origin = nav::web_origin(&url).ok_or_else(|| "bad-url".to_string())?;
    let sso = match sso.as_deref() {
        Some(raw) => Some(nav::sso_origin(raw).ok_or_else(|| "bad-sso".to_string())?),
        None => None,
    };
    app.state::<Shell>()
        .remember(Place::Server { url: url.to_string() }, lang)?;
    open_board(&app, Target::Server { origin, sso }, WebviewUrl::External(url))
        .map_err(|_| "window-failed".to_string())?;
    let _ = window.destroy();
    Ok(())
}

#[tauri::command]
async fn desktop_probe_port(window: WebviewWindow, url: String) -> Result<&'static str, String> {
    guard(&window)?;
    let url = nav::server_url(&url).ok_or_else(|| "bad-url".to_string())?;
    let found = tauri::async_runtime::spawn_blocking(move || probe::port(&url))
        .await
        .map_err(|_| "probe-failed".to_string())?;
    Ok(found.as_str())
}

/* ------------------------------------------------------------ janelas ------------------------------------------------------------ */

fn open_chooser(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(CHOOSER) {
        return window.set_focus();
    }
    open_window(app, CHOOSER, Target::Chooser, WebviewUrl::App("desktop".into()))
}

fn open_board(app: &AppHandle, target: Target, url: WebviewUrl) -> tauri::Result<()> {
    // a janela anterior pode estar gravando o que falta (`leave`, até LEAVE_MAX)
    for _ in 0..240 {
        if app.get_webview_window(BOARD).is_none() {
            break;
        }
        thread::sleep(Duration::from_millis(50));
    }
    open_window(app, BOARD, target, url)
}

fn open_window(app: &AppHandle, label: &str, target: Target, url: WebviewUrl) -> tauri::Result<()> {
    let chooser = target == Target::Chooser;
    let mut builder = WebviewWindowBuilder::new(app, label, url)
        .title(TITLE)
        .inner_size(if chooser { 1000. } else { 1360. }, if chooser { 720. } else { 860. })
        .min_inner_size(480., 480.)
        .center()
        // sem isto o Tauri intercepta o arrastar de arquivos e o board não recebe o que a pessoa solta
        .disable_drag_drop_handler()
        .on_web_resource_request(|request, response| {
            let path = request.uri().path().to_string();
            headers::apply(&path, response.headers_mut());
        });
    if let Some(dir) = test_dir() {
        builder = builder.data_directory(dir.join("webview"));
    }
    #[cfg(debug_assertions)]
    {
        builder = builder.initialization_script(testing::WATCH_CSP);
    }
    let nav_app = app.clone();
    let nav_label = label.to_string();
    let nav_target = target.clone();
    let win_app = app.clone();
    let win_label = label.to_string();
    if !chooser {
        builder = builder.on_download(on_download);
    }
    builder
        .on_navigation(move |url| match nav::navigation(&nav_target, url) {
            Verdict::Allow => true,
            Verdict::OpenChooser => {
                switch_place(&nav_app);
                false
            }
            Verdict::External => {
                external::open(url);
                false
            }
            Verdict::Deny => {
                let host = url.host_str().unwrap_or(url.scheme()).to_string();
                notify(&nav_app, &nav_label, "title.blocked", &[("host", &host)]);
                false
            }
        })
        .on_new_window(move |url, _| {
            match nav::new_window(&target, &url) {
                NewWindow::Inside => go_inside(&win_app, &win_label, url),
                NewWindow::External => external::open(&url),
                NewWindow::Deny => {}
            }
            NewWindowResponse::Deny
        })
        .build()?;
    Ok(())
}

/// Downloads: o motor salva em Downloads (sem sobrescrever) e o título avisa. Só as janelas de board registram isto —
/// no Linux o tratador é do contexto do motor, e o de uma janela já fechada cancelaria o download das seguintes; com o
/// mesmo nome de janela, os tratadores antigos encontram a janela nova.
fn on_download(webview: Webview, event: DownloadEvent<'_>) -> bool {
    match event {
        DownloadEvent::Requested { destination, .. } => {
            if let (Some(dir), Some(name)) = (test_dir(), destination.file_name().map(PathBuf::from)) {
                *destination = dir.join(name);
            }
        }
        DownloadEvent::Finished { path, success, .. } => {
            let name = path
                .as_deref()
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            let key = if success { "title.saved" } else { "title.saveFailed" };
            notify(webview.app_handle(), webview.label(), key, &[("file", &name)]);
        }
        _ => {}
    }
    true
}

/// Aviso curto no título da janela (o título volta em alguns segundos). A página remota não participa.
fn notify(app: &AppHandle, label: &str, key: &'static str, params: &[(&str, &str)]) {
    let lang = app.state::<Shell>().lang();
    let title = format!("{TITLE} — {}", text::message(&lang, key, params));
    let app = app.clone();
    let label = label.to_string();
    thread::spawn(move || {
        for (wait, title) in [(0, title.as_str()), (6000, TITLE)] {
            thread::sleep(Duration::from_millis(wait));
            if let Some(window) = app.get_webview_window(&label) {
                let _ = window.set_title(title);
            }
        }
    });
}

fn go_inside(app: &AppHandle, label: &str, url: Url) {
    let app = app.clone();
    let label = label.to_string();
    // fora do evento do motor: navegar dentro dele trava a janela no Windows
    thread::spawn(move || {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.navigate(url);
        }
    });
}

/// Pede para o app gravar o que falta (o mesmo evento de fechar a aba) e só destrói a janela quando a página disser
/// duas vezes seguidas que não falta nada (ou no teto `LEAVE_MAX`). Antes era um tempo fixo, e gravação lenta se perdia.
fn leave(window: &WebviewWindow) {
    let _ = window.eval("window.dispatchEvent(new Event('beforeunload'))");
    let _ = window.hide();
    let window = window.clone();
    thread::spawn(move || {
        let start = Instant::now();
        let mut quiet = 0;
        while quiet < 2 && start.elapsed() < LEAVE_MAX {
            thread::sleep(LEAVE_STEP);
            quiet = if pending_saves(&window) == Some(0) {
                quiet + 1
            } else {
                0
            };
        }
        let _ = window.destroy();
    });
}

/// `None` = a página não respondeu (ocupada ou trocando de endereço): conta como "ainda gravando".
fn pending_saves(window: &WebviewWindow) -> Option<u64> {
    let (tx, rx) = mpsc::channel();
    window
        .eval_with_callback(PENDING_SAVES, move |answer| {
            let _ = tx.send(answer);
        })
        .ok()?;
    parse_count(&rx.recv_timeout(Duration::from_secs(1)).ok()?)
}

/// A resposta do motor vem em JSON (`0`, `2`, às vezes `2.0`).
fn parse_count(answer: &str) -> Option<u64> {
    let n: f64 = answer.trim().parse().ok()?;
    (n.is_finite() && n >= 0.0).then_some(n as u64)
}

/// Abre a escolha e fecha as janelas de board (a escolha abre primeiro: o programa não fica sem janela).
fn switch_place(app: &AppHandle) {
    let app = app.clone();
    thread::spawn(move || {
        if open_chooser(&app).is_ok() {
            for (label, window) in app.webview_windows() {
                if label != CHOOSER {
                    leave(&window);
                }
            }
        }
    });
}

fn focus_all(app: &AppHandle) {
    for window in app.webview_windows().values() {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/* ------------------------------------------------------------- menu ------------------------------------------------------------- */

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let lang = app.state::<Shell>().lang();
    let label = |key| text::message(&lang, key, &[]);
    let menu = Submenu::with_items(
        app,
        TITLE,
        true,
        &[
            &MenuItem::with_id(app, "switch", label("menu.switch"), true, None::<&str>)?,
            &MenuItem::with_id(app, "reload", label("menu.reload"), true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", label("menu.quit"), true, None::<&str>)?,
        ],
    )?;
    Menu::with_items(app, &[&menu])
}

fn on_menu(app: &AppHandle, id: &str) {
    match id {
        "switch" => switch_place(app),
        "reload" => {
            for window in app.webview_windows().values() {
                let _ = window.reload();
            }
        }
        "quit" => {
            for (label, window) in app.webview_windows() {
                if label == CHOOSER {
                    let _ = window.destroy();
                } else {
                    leave(&window);
                }
            }
        }
        _ => {}
    }
}

/* ------------------------------------------------------------ abertura ------------------------------------------------------------ */

/// Pasta descartável dos testes (`npm run test:desktop:app`). Não existe no programa distribuído.
fn test_dir() -> Option<PathBuf> {
    #[cfg(debug_assertions)]
    return testing::dir();
    #[cfg(not(debug_assertions))]
    None
}

/// Pedidos da outra abertura do programa (e os ganchos de teste, só na depuração).
fn watch(app: AppHandle, instance: single::Instance) {
    thread::spawn(move || loop {
        thread::sleep(if test_dir().is_some() {
            Duration::from_millis(60)
        } else {
            Duration::from_millis(600)
        });
        if instance.take_signal() {
            focus_all(&app);
        }
        #[cfg(debug_assertions)]
        testing::poll(&app);
    });
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            desktop_state,
            desktop_use_local,
            desktop_use_server,
            desktop_probe_port
        ])
        .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() != CHOOSER {
                    if let Some(webview) = window.app_handle().get_webview_window(window.label()) {
                        api.prevent_close();
                        leave(&webview);
                    }
                }
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let dir = match test_dir() {
                Some(dir) => dir,
                None => handle.path().app_local_data_dir()?,
            };
            let Some(instance) = single::acquire(&dir)? else {
                std::process::exit(0);
            };
            let choice = Choice::load(&dir);
            let place = choice.place.clone();
            app.manage(Shell {
                dir,
                choice: Mutex::new(choice),
                auto: AtomicBool::new(true),
            });
            app.set_menu(build_menu(&handle)?)?;
            watch(handle.clone(), instance);
            // Modo Local lembrado abre direto; servidor lembrado passa pela escolha, que testa a conexão antes
            match place {
                Some(Place::Local) => open_board(&handle, Target::Local, WebviewUrl::App("index.html".into()))?,
                _ => open_chooser(&handle)?,
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("ludraw");
}

#[cfg(test)]
mod tests {
    use super::parse_count;

    #[test]
    fn pending_saves_answer() {
        assert_eq!(parse_count("0"), Some(0));
        assert_eq!(parse_count(" 2 "), Some(2));
        assert_eq!(parse_count("2.0"), Some(2));
        for bad in ["", "null", "\"0\"", "-1", "NaN", "{}"] {
            assert_eq!(parse_count(bad), None, "{bad}");
        }
    }
}
