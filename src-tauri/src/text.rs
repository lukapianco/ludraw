//! Textos do menu nativo e dos avisos no título: os mesmos catálogos da interface (`src/locales/*/desktop.json`).

use std::{collections::HashMap, sync::OnceLock};

type Catalog = HashMap<String, String>;

fn catalog(pt: bool) -> &'static Catalog {
    static PT: OnceLock<Catalog> = OnceLock::new();
    static EN: OnceLock<Catalog> = OnceLock::new();
    let parse = |text: &str| serde_json::from_str(text).expect("desktop.json");
    if pt {
        PT.get_or_init(|| parse(include_str!("../../src/locales/pt-BR/desktop.json")))
    } else {
        EN.get_or_init(|| parse(include_str!("../../src/locales/en/desktop.json")))
    }
}

/// Mensagem do idioma (português para `pt*`, inglês para o resto), com `{nome}` trocado pelo valor.
pub fn message(lang: &str, key: &str, params: &[(&str, &str)]) -> String {
    let pt = lang.to_ascii_lowercase().starts_with("pt");
    let mut text = catalog(pt).get(key).cloned().unwrap_or_else(|| key.to_string());
    for (name, value) in params {
        text = text.replace(&format!("{{{name}}}"), value);
    }
    text
}

/// Idioma do sistema (antes de a pessoa escolher um na interface).
#[cfg(windows)]
pub fn system_lang() -> String {
    use windows::Win32::Globalization::GetUserDefaultLocaleName;
    let mut buffer = [0u16; 85];
    // SAFETY: o Windows grava no máximo `buffer.len()` unidades e devolve quantas usou (com o zero final).
    let used = unsafe { GetUserDefaultLocaleName(&mut buffer) };
    usize::try_from(used)
        .ok()
        .filter(|n| *n > 1)
        .map(|n| String::from_utf16_lossy(&buffer[..n - 1]))
        .unwrap_or_else(|| "pt-BR".into())
}

#[cfg(not(windows))]
pub fn system_lang() -> String {
    ["LC_ALL", "LC_MESSAGES", "LANG"]
        .iter()
        .filter_map(|name| std::env::var(name).ok())
        .find(|value| !value.is_empty())
        .unwrap_or_else(|| "pt-BR".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_key_used_here_exists_in_both_languages() {
        for key in [
            "menu.switch",
            "menu.reload",
            "menu.quit",
            "title.blocked",
            "title.saved",
            "title.saveFailed",
        ] {
            for lang in ["pt-BR", "en"] {
                assert_ne!(message(lang, key, &[]), key, "{lang} {key}");
            }
        }
        assert_ne!(message("pt-BR", "menu.quit", &[]), message("en", "menu.quit", &[]));
        assert!(message("pt-BR", "title.blocked", &[("host", "x.example.com")]).contains("x.example.com"));
        assert!(!system_lang().is_empty());
    }
}
