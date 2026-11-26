//! Escolha de onde trabalhar, lembrada entre aberturas. Só modo, endereço do servidor e idioma: nenhum token.

use std::{fs, io::Write, path::Path};

use serde::{Deserialize, Serialize};

use crate::nav;

const FILE: &str = "desktop.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase", tag = "mode")]
pub enum Place {
    Local,
    Server { url: String },
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Choice {
    #[serde(default)]
    pub place: Option<Place>,
    #[serde(default)]
    pub lang: Option<String>,
}

/// Código de idioma curto (`pt-BR`, `en`); qualquer outra coisa é ignorada.
pub fn clean_lang(raw: &str) -> Option<String> {
    let ok = (2..=15).contains(&raw.len()) && raw.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    ok.then(|| raw.to_string())
}

impl Choice {
    /// Arquivo ausente, ilegível ou com endereço inválido = nenhuma escolha (mostra o primeiro uso).
    pub fn load(dir: &Path) -> Self {
        let Ok(text) = fs::read_to_string(dir.join(FILE)) else {
            return Self::default();
        };
        let mut choice: Self = serde_json::from_str(&text).unwrap_or_default();
        if let Some(Place::Server { url }) = &choice.place {
            choice.place = nav::server_url(url).map(|u| Place::Server { url: u.to_string() });
        }
        choice.lang = choice.lang.as_deref().and_then(clean_lang);
        choice
    }

    /// Grava num arquivo ao lado e troca de uma vez (queda no meio não corrompe a escolha).
    pub fn save(&self, dir: &Path) -> std::io::Result<()> {
        fs::create_dir_all(dir)?;
        let tmp = dir.join("desktop.json.tmp");
        let mut file = fs::File::create(&tmp)?;
        file.write_all(serde_json::to_string_pretty(self)?.as_bytes())?;
        file.sync_all()?;
        fs::rename(tmp, dir.join(FILE))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("ludraw-choice-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn round_trip() {
        let d = dir("rt");
        for place in [
            Place::Local,
            Place::Server {
                url: "https://draw.example.com/".into(),
            },
        ] {
            let c = Choice {
                place: Some(place),
                lang: Some("pt-BR".into()),
            };
            c.save(&d).unwrap();
            assert_eq!(Choice::load(&d), c);
        }
        assert!(!d.join("desktop.json.tmp").exists());
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn bad_files_mean_no_choice() {
        let d = dir("bad");
        assert_eq!(Choice::load(&d), Choice::default());
        for text in [
            "",
            "{",
            "[]",
            r#"{"place":{"mode":"server","url":"file:///etc/passwd"}}"#,
            r#"{"place":{"mode":"server","url":"https://u:p@draw.example.com"}}"#,
            r#"{"place":{"mode":"other"}}"#,
        ] {
            fs::write(d.join(FILE), text).unwrap();
            assert_eq!(Choice::load(&d).place, None, "{text}");
        }
        fs::write(d.join(FILE), r#"{"place":{"mode":"local"},"lang":"../../x"}"#).unwrap();
        assert_eq!(
            Choice::load(&d),
            Choice {
                place: Some(Place::Local),
                lang: None
            }
        );
        fs::remove_dir_all(d).unwrap();
    }
}
