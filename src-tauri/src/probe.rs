//! Teste de porta (4º comando): só diz se algo responde no host e porta do endereço digitado. Nada é enviado nem lido.
//! Serve para a tela explicar a falha: porta aberta com `https` falhando = certificado em que o computador não confia.

use std::{
    net::{TcpStream, ToSocketAddrs},
    time::Duration,
};

use tauri::Url;

const TIMEOUT: Duration = Duration::from_millis(2500);
const MAX_ADDRESSES: usize = 4;

#[derive(Debug, PartialEq, Eq)]
pub enum Port {
    Open,
    Closed,
    UnknownHost,
}

impl Port {
    pub fn as_str(&self) -> &'static str {
        match self {
            Port::Open => "open",
            Port::Closed => "closed",
            Port::UnknownHost => "unknown-host",
        }
    }
}

pub fn port(url: &Url) -> Port {
    let (Some(host), Some(port)) = (url.host_str(), url.port_or_known_default()) else {
        return Port::UnknownHost;
    };
    // IPv6 vem entre colchetes no endereço; o resolvedor quer sem eles
    let host = host.trim_start_matches('[').trim_end_matches(']');
    let Ok(addresses) = (host, port).to_socket_addrs() else {
        return Port::UnknownHost;
    };
    let mut any = false;
    for address in addresses.take(MAX_ADDRESSES) {
        any = true;
        if TcpStream::connect_timeout(&address, TIMEOUT).is_ok() {
            return Port::Open;
        }
    }
    if any {
        Port::Closed
    } else {
        Port::UnknownHost
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn open_and_closed_ports() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("https://127.0.0.1:{}/", listener.local_addr().unwrap().port());
        let url = Url::parse(&address).unwrap();
        assert_eq!(port(&url), Port::Open);
        drop(listener);
        assert_eq!(port(&url), Port::Closed);
    }

    #[test]
    fn unknown_host() {
        // `.invalid` é reservado (RFC 2606): nunca resolve
        assert_eq!(port(&Url::parse("https://ludraw.invalid/").unwrap()), Port::UnknownHost);
        assert_eq!(port(&Url::parse("mailto:a@example.com").unwrap()), Port::UnknownHost);
    }
}
