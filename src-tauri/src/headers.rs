//! Cabeçalhos de segurança do protocolo local. O texto vem de `src/utils/securityHeaders.ts` (fonte única com o
//! servidor e o Vite), gravado em `generated/headers.json` por `scripts/desktop-headers.mjs` antes da compilação.

use std::{collections::BTreeMap, sync::OnceLock};

use serde::Deserialize;
use tauri::http::{
    header::{HeaderName, HeaderValue, CONTENT_TYPE},
    HeaderMap,
};

use crate::nav::CHOOSER_PATH;

type Headers = BTreeMap<String, String>;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Table {
    app: Headers,
    chooser: Headers,
    asset: Headers,
    /// caminho (`/ext/station.html`) → cabeçalhos do documento isolado das extensões
    isolated: BTreeMap<String, Headers>,
}

fn table() -> &'static Table {
    static TABLE: OnceLock<Table> = OnceLock::new();
    TABLE.get_or_init(|| {
        serde_json::from_str(include_str!("../generated/headers.json")).expect("generated/headers.json")
    })
}

fn pick<'a>(table: &'a Table, path: &str, html: bool) -> &'a Headers {
    if path == CHOOSER_PATH {
        &table.chooser
    } else if let Some(isolated) = table.isolated.get(path) {
        isolated
    } else if html {
        &table.app
    } else {
        &table.asset
    }
}

/// Aplica os cabeçalhos da resposta de um arquivo embutido. Todo HTML que não seja dos documentos isolados nem o da
/// escolha recebe a CSP do app (o protocolo devolve o `index.html` para caminho desconhecido).
pub fn apply(path: &str, headers: &mut HeaderMap) {
    let html = headers
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_none_or(|v| v.starts_with("text/html"));
    for (name, value) in pick(table(), path, html) {
        if let (Ok(name), Ok(value)) = (HeaderName::try_from(name.as_str()), HeaderValue::from_str(value)) {
            headers.insert(name, value);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn csp(path: &str, content_type: &str) -> String {
        let mut h = HeaderMap::new();
        h.insert(CONTENT_TYPE, HeaderValue::from_str(content_type).unwrap());
        apply(path, &mut h);
        h.get("content-security-policy")
            .map(|v| v.to_str().unwrap().to_string())
            .unwrap_or_default()
    }

    #[test]
    fn each_document_has_its_own_policy() {
        let app = csp("/", "text/html");
        assert_eq!(app, csp("/index.html", "text/html"));
        assert_eq!(app, csp("/anything/else", "text/html; charset=utf-8"));
        assert!(app.contains("connect-src 'self' data:;"), "{app}");
        assert!(!app.contains("ipc:"), "{app}");
        let chooser = csp("/desktop", "text/html");
        assert!(chooser.contains("ipc: http://ipc.localhost"), "{chooser}");
        for policy in [&app, &chooser] {
            let script = policy.split(';').find(|d| d.trim().starts_with("script-src")).unwrap();
            assert!(!script.contains("unsafe"), "{script}");
        }
        assert!(csp("/ext/station.html", "text/html").contains("connect-src 'none'"));
        assert!(csp("/ext/panel-host.html", "text/html").contains("connect-src 'none'"));
        assert_eq!(csp("/assets/x.js", "text/javascript"), "");
    }

    #[test]
    fn missing_content_type_is_treated_as_a_page() {
        let mut h = HeaderMap::new();
        apply("/x", &mut h);
        assert!(h.contains_key("content-security-policy"));
        assert_eq!(h.get("x-content-type-options").unwrap(), "nosniff");
    }
}
