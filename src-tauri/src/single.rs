//! Instância única por perfil, só com a biblioteca padrão: trava de arquivo + um arquivo de aviso.
//! No Linux, dois processos no mesmo perfil poderiam estragar o banco local dos boards.

use std::{
    fs::{self, File, TryLockError},
    path::{Path, PathBuf},
    time::SystemTime,
};

pub struct Instance {
    /// A trava vale enquanto este arquivo estiver aberto.
    _lock: File,
    signal: PathBuf,
}

/// `Some` = somos a primeira instância. `None` = já há outra (que foi avisada para vir à frente).
pub fn acquire(dir: &Path) -> std::io::Result<Option<Instance>> {
    fs::create_dir_all(dir)?;
    let lock = File::options()
        .create(true)
        .truncate(false)
        .write(true)
        .open(dir.join("ludraw.lock"))?;
    let signal = dir.join("ludraw.focus");
    match lock.try_lock() {
        Ok(()) => {
            let _ = fs::remove_file(&signal);
            Ok(Some(Instance { _lock: lock, signal }))
        }
        Err(TryLockError::WouldBlock) => {
            fs::write(&signal, format!("{:?}", SystemTime::now()))?;
            Ok(None)
        }
        Err(TryLockError::Error(e)) => Err(e),
    }
}

impl Instance {
    /// Outra abertura pediu para esta vir à frente? (consome o pedido)
    pub fn take_signal(&self) -> bool {
        self.signal.exists() && fs::remove_file(&self.signal).is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn second_instance_is_refused_and_signals_the_first() {
        let dir = std::env::temp_dir().join(format!("ludraw-single-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let first = acquire(&dir).unwrap().expect("primeira instância");
        assert!(!first.take_signal());
        assert!(acquire(&dir).unwrap().is_none());
        assert!(first.take_signal());
        assert!(!first.take_signal());
        drop(first);
        assert!(acquire(&dir).unwrap().is_some());
        fs::remove_dir_all(dir).unwrap();
    }
}
