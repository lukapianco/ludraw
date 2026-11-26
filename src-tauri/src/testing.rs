//! Ganchos do `npm run test:desktop:app`. Este módulo SÓ existe na compilação de depuração: o programa distribuído
//! (release) não tem nada disto. Mesmo na depuração, só funciona com `LUDRAW_DESKTOP_TEST_DIR` definida.
//!
//!  - perfil, escolha e downloads na pasta descartável (nunca nos dados de quem está testando);
//!  - `menu.txt` aciona um item do menu; `eval.js` roda na janela aberta e o programa lê a resposta da página
//!    (`result.txt`). Na R7 a resposta voltava pelo título, e o WebKit às vezes juntava duas trocas e a perdia;
//!  - `external.txt` recebe os endereços que abririam no programa do sistema (nada é aberto no teste).

use std::{fs, path::PathBuf};

use tauri::{AppHandle, Manager, Url, WebviewWindow};

/// Lê e apaga a resposta guardada pela página (string JSON, ou `null` se ainda não houver).
const TAKE_RESULT: &str =
    "(()=>{const r=window.__ldTestResult;if(r===undefined)return null;delete window.__ldTestResult;return r})()";

/// Conta as violações de CSP da página desde o começo.
pub const WATCH_CSP: &str = "window.__ldViolations=[];document.addEventListener('securitypolicyviolation',e=>window.__ldViolations.push(e.effectiveDirective+' '+e.blockedURI));";

pub fn dir() -> Option<PathBuf> {
    std::env::var_os("LUDRAW_DESKTOP_TEST_DIR").map(PathBuf::from)
}

/// No teste, o endereço é só anotado. `true` = já tratado.
pub fn record_external(url: &Url) -> bool {
    let Some(dir) = dir() else { return false };
    let file = dir.join("external.txt");
    let before = fs::read_to_string(&file).unwrap_or_default();
    let _ = fs::write(file, format!("{before}{url}\n"));
    true
}

fn write_result(result: &str) {
    if let Some(dir) = dir() {
        let tmp = dir.join("result.tmp");
        if fs::write(&tmp, result).is_ok() {
            let _ = fs::rename(tmp, dir.join("result.txt"));
        }
    }
}

/// Busca a resposta na janela. O motor devolve o valor em JSON: aqui, uma string com o JSON da resposta.
fn collect(window: &WebviewWindow) {
    let _ = window.eval_with_callback(TAKE_RESULT, |answer| {
        if let Ok(Some(result)) = serde_json::from_str::<Option<String>>(&answer) {
            write_result(&result);
        }
    });
}

fn take(name: &str) -> Option<String> {
    let file = dir()?.join(name);
    let text = fs::read_to_string(&file).ok()?;
    fs::remove_file(file).ok()?;
    Some(text)
}

pub fn poll(app: &AppHandle) {
    if let Some(id) = take("menu.txt") {
        crate::on_menu(app, id.trim());
    }
    // a janela visível (a que está saindo fica escondida até gravar)
    let Some(window) = app
        .webview_windows()
        .into_values()
        .find(|w| w.is_visible().unwrap_or(false))
    else {
        return;
    };
    if let Some(code) = take("eval.js") {
        let script = format!(
            "(async()=>{{let r;try{{r={{ok:await (async()=>{{{code}}})()}}}}catch(e){{r={{error:String(e&&e.stack||e)}}}}\
             window.__ldTestResult=JSON.stringify({{label:{:?},...r}})}})()",
            window.label()
        );
        let _ = window.eval(&script);
    }
    collect(&window);
}
