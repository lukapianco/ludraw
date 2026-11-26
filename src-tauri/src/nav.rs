//! Regras de navegação (puras, testadas): para onde cada janela pode ir e quem abre fora.
//!
//! Decisão D14: no Modo Servidor, só a origem do servidor escolhido e a origem do emissor do SSO que ele informou.
//!
//! RUSTSEC-2026-0592 (`url` <= 2.5.8): `Url::origin()` estoura a pilha com `blob:` aninhado. Aqui a origem só é
//! calculada para `http`/`https`, e `blob:` é comparado como texto. Não chamar `Url::origin()` fora de `web_origin`.

use tauri::Url;

/// Origem dos arquivos embutidos do app. Permanente: define onde ficam os boards do Modo Local.
#[cfg(windows)]
pub const LOCAL_ORIGIN: &str = "http://tauri.localhost";
#[cfg(not(windows))]
pub const LOCAL_ORIGIN: &str = "tauri://localhost";

/// Caminho do documento da janela de escolha (o único que fala com a ponte).
pub const CHOOSER_PATH: &str = "/desktop";

/// O que a janela mostra.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Target {
    Chooser,
    Local,
    Server { origin: String, sso: Option<String> },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    Allow,
    /// A página local pediu a tela de escolha.
    OpenChooser,
    /// Recusa e abre no programa do sistema (e-mail).
    External,
    Deny,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NewWindow {
    /// Mesma origem: abre na própria janela.
    Inside,
    /// Outro site ou e-mail: abre no programa do sistema.
    External,
    Deny,
}

/// Origem `esquema://host[:porta]` de um endereço `http`/`https`; qualquer outro esquema = nenhuma.
pub fn web_origin(url: &Url) -> Option<String> {
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    Some(url.origin().ascii_serialization())
}

/// O endereço é dos arquivos embutidos do app?
pub fn is_local(url: &Url) -> bool {
    if cfg!(windows) {
        web_origin(url).as_deref() == Some(LOCAL_ORIGIN)
    } else {
        url.scheme() == "tauri" && url.host_str() == Some("localhost") && url.port().is_none()
    }
}

pub fn is_chooser_document(url: &Url) -> bool {
    is_local(url) && url.path() == CHOOSER_PATH
}

/// `blob:<origem>/…` desta origem, comparado como texto (download do próprio app).
fn is_own_blob(url: &Url, origin: &str) -> bool {
    url.scheme() == "blob"
        && url
            .path()
            .strip_prefix(origin)
            .is_some_and(|rest| rest.starts_with('/'))
}

/// `about:blank`/`about:srcdoc`: documentos vazios e quadros internos (no Linux os quadros também passam por aqui).
fn is_blank(url: &Url) -> bool {
    url.scheme() == "about" && matches!(url.path(), "blank" | "srcdoc")
}

pub fn navigation(target: &Target, url: &Url) -> Verdict {
    if is_blank(url) {
        return Verdict::Allow;
    }
    let allowed = match target {
        Target::Chooser => is_chooser_document(url),
        Target::Local => {
            if is_chooser_document(url) {
                return Verdict::OpenChooser;
            }
            is_local(url) || is_own_blob(url, LOCAL_ORIGIN)
        }
        Target::Server { origin, sso } => {
            web_origin(url).is_some_and(|o| o == *origin || Some(&o) == sso.as_ref()) || is_own_blob(url, origin)
        }
    };
    if allowed {
        Verdict::Allow
    } else if url.scheme() == "mailto" && openable_outside(url) && *target != Target::Chooser {
        Verdict::External
    } else {
        Verdict::Deny
    }
}

pub fn new_window(target: &Target, url: &Url) -> NewWindow {
    let inside = match target {
        Target::Chooser => false,
        Target::Local => is_local(url) && !is_chooser_document(url),
        Target::Server { origin, .. } => web_origin(url).as_ref() == Some(origin),
    };
    if inside {
        NewWindow::Inside
    } else if openable_outside(url) {
        NewWindow::External
    } else {
        NewWindow::Deny
    }
}

/// Só `http`, `https` e `mailto` (tamanho limitado) saem para o programa do sistema.
pub fn openable_outside(url: &Url) -> bool {
    url.as_str().len() <= 4096
        && match url.scheme() {
            "http" | "https" => url.host_str().is_some() && !is_local(url),
            "mailto" => true,
            _ => false,
        }
}

/// Nomes que o motor usa para o próprio programa (nos dois sistemas): nunca são um servidor.
fn is_reserved(url: &Url) -> bool {
    matches!(url.host_str(), Some("tauri.localhost" | "ipc.localhost"))
}

/// Endereço do servidor digitado: `http(s)`, com host, sem usuário/senha; consulta e fragmento saem.
pub fn server_url(raw: &str) -> Option<Url> {
    let mut url = Url::parse(raw.trim()).ok()?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none_or(str::is_empty) {
        return None;
    }
    if !url.username().is_empty() || url.password().is_some() || url.as_str().len() > 2048 || is_reserved(&url) {
        return None;
    }
    url.set_query(None);
    url.set_fragment(None);
    let path = url.path().trim_end_matches('/').to_string();
    url.set_path(&format!("{path}/"));
    Some(url)
}

/// Origem do emissor do SSO informada pelo servidor (`/info.ssoOrigin`): precisa ser exatamente uma origem.
pub fn sso_origin(raw: &str) -> Option<String> {
    let url = server_url(raw)?;
    if url.path() == "/" && !raw.contains('*') {
        web_origin(&url)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u(s: &str) -> Url {
        Url::parse(s).unwrap()
    }
    fn local(path: &str) -> Url {
        u(&format!("{LOCAL_ORIGIN}{path}"))
    }
    fn server() -> Target {
        Target::Server {
            origin: "https://draw.example.com".into(),
            sso: Some("https://login.example.com".into()),
        }
    }

    #[test]
    fn local_window_stays_local() {
        assert_eq!(navigation(&Target::Local, &local("/")), Verdict::Allow);
        assert_eq!(
            navigation(&Target::Local, &local("/index.html#/board/x")),
            Verdict::Allow
        );
        assert_eq!(navigation(&Target::Local, &local("/ext/station.html")), Verdict::Allow);
        assert_eq!(navigation(&Target::Local, &local("/desktop")), Verdict::OpenChooser);
        for bad in [
            "https://draw.example.com/",
            "http://localhost:5173/",
            "http://evil.tauri.localhost/",
            "http://tauri.localhost:81/",
            "https://tauri.localhost/",
            "tauri://other/",
            "file:///etc/passwd",
            "data:text/html,x",
            "javascript:alert(1)",
        ] {
            assert_eq!(navigation(&Target::Local, &u(bad)), Verdict::Deny, "{bad}");
        }
    }

    #[test]
    fn server_window_only_server_and_issuer() {
        let t = server();
        assert_eq!(navigation(&t, &u("https://draw.example.com/#/board/1")), Verdict::Allow);
        assert_eq!(
            navigation(&t, &u("https://draw.example.com/api/v1/auth/oidc/start")),
            Verdict::Allow
        );
        assert_eq!(navigation(&t, &u("https://login.example.com/auth?x=1")), Verdict::Allow);
        for bad in [
            "http://draw.example.com/",
            "https://draw.example.com:8443/",
            "https://draw.example.com.evil.test/",
            "https://draw.example.com@evil.test/",
            "https://sub.login.example.com/",
            "https://other.example.com/",
            "file:///c:/",
            "data:text/html,x",
        ] {
            assert_eq!(navigation(&t, &u(bad)), Verdict::Deny, "{bad}");
        }
        // a página remota nunca volta para o app local nem abre a escolha
        assert_eq!(navigation(&t, &local("/")), Verdict::Deny);
        assert_eq!(navigation(&t, &local("/desktop")), Verdict::Deny);
    }

    #[test]
    fn chooser_window_never_leaves() {
        assert_eq!(navigation(&Target::Chooser, &local("/desktop")), Verdict::Allow);
        assert_eq!(
            navigation(&Target::Chooser, &local("/desktop?lang=qps")),
            Verdict::Allow
        );
        assert_eq!(navigation(&Target::Chooser, &local("/")), Verdict::Deny);
        assert_eq!(
            navigation(&Target::Chooser, &u("https://draw.example.com/")),
            Verdict::Deny
        );
        assert_eq!(navigation(&Target::Chooser, &u("mailto:a@example.com")), Verdict::Deny);
    }

    #[test]
    fn own_blob_only() {
        assert_eq!(
            navigation(&Target::Local, &u(&format!("blob:{LOCAL_ORIGIN}/abc"))),
            Verdict::Allow
        );
        assert_eq!(
            navigation(&Target::Local, &u("blob:https://evil.test/abc")),
            Verdict::Deny
        );
        assert_eq!(
            navigation(&server(), &u("blob:https://draw.example.com/abc")),
            Verdict::Allow
        );
        assert_eq!(
            navigation(&server(), &u("blob:https://draw.example.com.evil.test/abc")),
            Verdict::Deny
        );
    }

    /// RUSTSEC-2026-0592: `blob:` aninhado não pode chegar ao `Url::origin()` (derrubaria o programa).
    #[test]
    fn nested_blob_does_not_crash() {
        let nested = u(&format!("{}https://example.com/", "blob:".repeat(10_000)));
        for t in [Target::Chooser, Target::Local, server()] {
            assert_eq!(navigation(&t, &nested), Verdict::Deny);
            assert_eq!(new_window(&t, &nested), NewWindow::Deny);
        }
        assert!(!is_local(&nested));
        assert_eq!(web_origin(&nested), None);
    }

    #[test]
    fn new_windows() {
        let t = server();
        assert_eq!(
            new_window(&t, &u("https://draw.example.com/#/board/2")),
            NewWindow::Inside
        );
        assert_eq!(
            new_window(&t, &u("https://login.example.com/popup")),
            NewWindow::External
        );
        assert_eq!(new_window(&t, &u("https://www.example.com/")), NewWindow::External);
        assert_eq!(new_window(&t, &u("mailto:a@example.com")), NewWindow::External);
        assert_eq!(new_window(&Target::Local, &local("/#/board/2")), NewWindow::Inside);
        assert_eq!(new_window(&Target::Local, &local("/desktop")), NewWindow::Deny);
        for bad in [
            "file:///c:/windows/system32/calc.exe",
            "javascript:1",
            "data:text/html,x",
            "ms-settings:",
            "smb://host/x",
            "vbscript:x",
        ] {
            assert_eq!(new_window(&t, &u(bad)), NewWindow::Deny, "{bad}");
        }
        assert_eq!(new_window(&t, &local("/")), NewWindow::Deny);
    }

    #[test]
    fn mail_links_open_outside() {
        assert_eq!(
            navigation(&Target::Local, &u("mailto:a@example.com")),
            Verdict::External
        );
        assert_eq!(navigation(&server(), &u("mailto:a@example.com")), Verdict::External);
    }

    #[test]
    fn server_addresses() {
        assert_eq!(
            server_url(" https://draw.example.com ").unwrap().as_str(),
            "https://draw.example.com/"
        );
        assert_eq!(
            server_url("http://192.168.0.10:3001/sub/?a=1#b").unwrap().as_str(),
            "http://192.168.0.10:3001/sub/"
        );
        for bad in [
            "",
            "draw.example.com",
            "ftp://x.example.com",
            "https://u:p@draw.example.com",
            "file:///x",
            "javascript:1",
            "http://tauri.localhost",
            "https://tauri.localhost:8443/x",
            "http://ipc.localhost",
            "tauri://localhost",
        ] {
            assert!(server_url(bad).is_none(), "{bad}");
        }
        assert_eq!(
            sso_origin("https://login.example.com"),
            Some("https://login.example.com".into())
        );
        assert_eq!(sso_origin("https://login.example.com/realm"), None);
        assert_eq!(sso_origin("https://*.example.com"), None);
        assert_eq!(sso_origin("javascript:1"), None);
    }

    #[test]
    fn blank_documents() {
        assert_eq!(navigation(&server(), &u("about:blank")), Verdict::Allow);
        assert_eq!(navigation(&server(), &u("about:srcdoc")), Verdict::Allow);
        assert_eq!(navigation(&server(), &u("about:config")), Verdict::Deny);
    }
}
