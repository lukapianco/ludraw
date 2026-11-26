#!/usr/bin/env node
/**
 * LuDraw — Auditoria de Sala Limpa (`npm run audit:legal`) — Chat 03 · pré-tarefa 3.
 *
 * Regras: ai-memory/CLEAN_ROOM.md (§5 licenças, R3–R10). Configuração: scripts/audit-terms.json.
 * Node ESM puro, sem dependências. Isto NÃO é parecer jurídico: é uma rede de segurança de engenharia.
 *
 *  a) Licenças    — package-lock.json + node_modules/<pkg>/package.json (quando instalado).
 *  b) Termos      — nomes/domínios de concorrentes, flags de proteção, cabeçalhos de licença/copyright,
 *                   SPDX alheio e source maps em src/, public/, index.html, package.json, docs/ e README.md.
 *  c) Assets      — inventário de public/, docs/ e imports de imagem/fonte/svg/áudio, cruzado com docs/PROVENANCE.md.
 *  d) Domínios    — URLs externas no código (fetch, img, link, script, url(), strings) × domínios esperados.
 *  e) Origem      — (Chat 08.6) SHA-256 de ai-memory/CLEAN_ROOM.md e ai-memory/refs/* registrados no
 *                   docs/PROVENANCE.md × arquivos reais: referência alterada ou sem registro BLOQUEIA;
 *                   CLEAN_ROOM.md diferente do registrado é AVISO (atualize o hash no fechamento).
 *  f) Avisos      — (Chat 08.6) THIRD_PARTY_NOTICES.txt do app e do servidor iguais ao que os lockfiles geram
 *                   (scripts/lib/notices.mjs) e presentes em dist/ e server/dist/ quando houver build.
 *  g) Relatório   — código de saída 1 se houver achados bloqueantes. SÓ LEITURA por padrão (Chat 08.6 · O-12):
 *                   grava docs/AUDIT_REPORT.md apenas com --write (`npm run docs:legal`) ou no caminho de --report.
 *
 * Uso: node scripts/audit-clean-room.mjs [--root <dir>] [--write] [--report <arquivo>] [--quiet]
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNotices, NOTICE_TARGETS } from './lib/notices.mjs';
import { checkDesktopNotices, DESKTOP_NOTICES } from './lib/desktopNotices.mjs';

/* ----------------------------------------------------------------------------
 * Configuração e utilidades
 * ------------------------------------------------------------------------- */

const argv = process.argv.slice(2);
const argValue = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};
const ROOT = path.resolve(argValue('--root') ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const REPORT = path.resolve(ROOT, argValue('--report') ?? 'docs/AUDIT_REPORT.md');
/** Chat 08.6 · O-12: o auditor só grava arquivos quando pedido (--write ou --report <arquivo>). */
const WRITE = argv.includes('--write') || argValue('--report') !== undefined;
const QUIET = argv.includes('--quiet');
const CONFIG_PATH = path.join(ROOT, 'scripts/audit-terms.json');

const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const exists = (file) => {
  try {
    fs.accessSync(file);
    return true;
  } catch {
    return false;
  }
};

const config = readJson(CONFIG_PATH);
const NEVER = new Set(config.scan.neverScan.map((p) => p.replace(/\/$/, '')));
const TEXT_EXT = new Set(config.scan.textExtensions);
const ASSET_EXT = new Set(config.assets.extensions);

/** Achados: { severity: 'block'|'warn'|'ok'|'info', area, file?, line?, rule, message, excerpt? } */
const findings = [];
const add = (f) => findings.push(f);

/** Domínio esperado: chave exata ou curinga `*.dominio` (ex.: `*.example.com`, reservado para exemplos — RFC 2606). */
function expectedFor(host) {
  if (config.expectedDomains[host]) return config.expectedDomains[host];
  for (const [k, v] of Object.entries(config.expectedDomains)) if (k.startsWith('*.') && (host === k.slice(2) || host.endsWith(k.slice(1)))) return v;
  return null;
}

/** Lista arquivos de uma entrada (arquivo ou pasta), respeitando `neverScan`. */
function listFiles(entry) {
  const abs = path.join(ROOT, entry);
  if (!exists(abs)) return [];
  const out = [];
  const walk = (p) => {
    const r = rel(p);
    if ([...NEVER].some((n) => r === n || r.startsWith(`${n}/`))) return;
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) fs.readdirSync(p).sort().forEach((f) => walk(path.join(p, f)));
    else out.push(p);
  };
  walk(abs);
  return out;
}

/** Arquivo/termo/linha coberto por uma exceção com justificativa escrita? */
function exceptionFor(file, termId, line) {
  for (const ex of config.exceptions ?? []) {
    const fileOk = ex.file === file || (ex.file.endsWith('/') && file.startsWith(ex.file)) || (ex.file.endsWith('*') && file.startsWith(ex.file.slice(0, -1)));
    const termOk = ex.term === '*' || ex.term === termId;
    const lineOk = ex.line === undefined || ex.line === line;
    if (fileOk && termOk && lineOk) return ex;
  }
  return null;
}

function validateExceptions() {
  for (const ex of config.exceptions ?? []) {
    if (!ex.reason || String(ex.reason).trim().length < 10) {
      add({ severity: 'warn', area: 'Configuração', file: 'scripts/audit-terms.json', rule: 'exceção-sem-justificativa', message: `Exceção para "${ex.file}" sem justificativa escrita: ela é ignorada.` });
    }
  }
}

/* ----------------------------------------------------------------------------
 * a) Licenças
 * ------------------------------------------------------------------------- */

/** Nível de um identificador SPDX isolado: ok | warn (aprovação) | block | unknown (fora da lista). */
function licenseIdLevel(rawId) {
  const L = config.licenses;
  const id = rawId.trim().replace(/\+$/, '').replace(/-(only|or-later)$/i, '');
  if (!id || /^UNLICENSED$/i.test(id)) return 'block';
  if (L.allowed.some((a) => a.toLowerCase() === id.toLowerCase())) return 'ok';
  if (L.approval.some((a) => new RegExp(`^${a}(-|$)`, 'i').test(id))) return 'warn';
  if (L.blocked.some((b) => new RegExp(`^${b}(-|$)`, 'i').test(id))) return 'block';
  if (/source.?available|commons.?clause|non.?commercial|elastic/i.test(id)) return 'block';
  return 'unknown';
}

/**
 * Classifica uma expressão SPDX (OR tem precedência menor que AND):
 * em "A OR B" vale a melhor opção; em "A AND B" vale a pior.
 */
function classifyLicense(raw) {
  if (!raw || (typeof raw === 'string' && !raw.trim())) return { level: 'block', why: 'sem licença declarada' };
  const text = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map((x) => x.type ?? x).join(' OR ') : String(raw.type ?? raw);
  const rank = { ok: 0, warn: 1, unknown: 2, block: 3 };
  const flat = text.replace(/[()]/g, ' ');
  const level = flat
    .split(/\s+OR\s+/i)
    .map((alt) => alt.split(/\s+AND\s+/i).map(licenseIdLevel).reduce((acc, lv) => (rank[lv] > rank[acc] ? lv : acc), 'ok'))
    .reduce((acc, lv) => (rank[lv] < rank[acc] ? lv : acc), 'block');
  if (level === 'unknown') return { level: 'warn', why: `${text} — licença fora da lista do CLEAN_ROOM §5: decidir/aprovar` };
  if (level === 'warn') return { level: 'warn', why: `${text} — só com aprovação explícita do usuário (CLEAN_ROOM §5)` };
  if (level === 'block') return { level: 'block', why: `${text} — proibida (CLEAN_ROOM §5)` };
  return { level: 'ok', why: text };
}

function nameFromLockKey(key) {
  const i = key.lastIndexOf('node_modules/');
  return key.slice(i + 'node_modules/'.length);
}

/**
 * Chat 07: o repositório tem duas raízes de pacote — o cliente (raiz) e o servidor (`server/`, com
 * package.json e package-lock.json próprios). As duas são auditadas com as mesmas regras.
 */
function auditLicenses() {
  const client = auditLicensesAt('');
  if (!exists(path.join(ROOT, 'server', 'package.json'))) return client;
  const server = auditLicensesAt('server');
  return { rows: [...client.rows, ...server.rows], installed: client.installed && server.installed };
}

function auditLicensesAt(base) {
  const rows = [];
  const scope = base || null;
  const at = (...p) => path.join(ROOT, base, ...p);
  const label = (p) => (base ? `${base}/${p}` : p);
  const pkgPath = at('package.json');
  const pkg = readJson(pkgPath);
  if (!pkg.license && WRITE) {
    pkg.license = 'MIT';
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    add({ severity: 'info', area: 'Licenças', file: label('package.json'), rule: 'licenca-raiz', message: 'Campo "license" ausente no package.json: adicionado "MIT" (LICENSE do repositório é MIT).' });
  } else if (!pkg.license) {
    add({ severity: 'block', area: 'Licenças', file: label('package.json'), rule: 'licenca-raiz', message: 'Campo "license" ausente no package.json (o LICENSE do repositório é MIT). Corrija à mão ou rode npm run docs:legal, que acrescenta "MIT".' });
  } else if (pkg.license !== 'MIT') {
    add({ severity: 'warn', area: 'Licenças', file: label('package.json'), rule: 'licenca-raiz', message: `package.json declara "${pkg.license}", mas o LICENSE do projeto é MIT.` });
  }

  const lockPath = at('package-lock.json');
  if (!exists(lockPath)) {
    add({ severity: 'block', area: 'Licenças', file: label('package-lock.json'), rule: 'lock-ausente', message: 'package-lock.json ausente: não dá para auditar as dependências.' });
    return { rows, installed: false };
  }
  const lock = readJson(lockPath);
  const nmDir = at('node_modules');
  const installed = exists(nmDir);
  const approvals = new Map((config.licenses.packageApprovals ?? []).map((a) => [a.package, a]));

  for (const [key, info] of Object.entries(lock.packages ?? {})) {
    if (!key) continue; // pacote raiz (o próprio LuDraw)
    if (info.link) continue;
    const name = info.name ?? nameFromLockKey(key);
    let license = info.license;
    let source = 'lock';
    let installedVersion = null;
    if (installed) {
      const pj = at(key, 'package.json');
      if (exists(pj)) {
        try {
          const p = readJson(pj);
          installedVersion = p.version ?? null;
          const nmLicense = p.license ?? p.licenses;
          if (nmLicense) {
            license = license ?? nmLicense;
            source = info.license ? 'lock + node_modules' : 'node_modules';
            const a = JSON.stringify(info.license ?? null);
            const b = JSON.stringify(typeof nmLicense === 'string' ? nmLicense : nmLicense);
            if (info.license && a !== b && typeof nmLicense === 'string') {
              add({ severity: 'warn', area: 'Licenças', file: rel(pj), rule: 'licenca-divergente', message: `${name}: lock diz ${info.license}, node_modules diz ${nmLicense}.` });
            }
          }
        } catch {
          /* package.json ilegível: fica a do lock */
        }
        if (installedVersion && info.version && installedVersion !== info.version) {
          add({ severity: 'warn', area: 'Licenças', file: rel(pj), rule: 'versao-divergente', message: `${name}: instalado ${installedVersion}, lock ${info.version} (rode \`npm ci\`).` });
        }
      }
    }
    let { level, why } = classifyLicense(license);
    const approval = approvals.get(name);
    // Chat 08.5: a aprovação vale só para a licença aprovada (se o pacote trocar de licença, volta a acusar)
    const approvalMatches = !!approval && (!approval.license || approval.license === (typeof license === 'string' ? license : JSON.stringify(license ?? null)));
    if (approval && approvalMatches && level !== 'block') {
      if (approval.approvedBy) {
        level = 'ok';
        why = `${why} — aprovado por ${approval.approvedBy}: ${approval.reason}`;
      } else {
        why = `${why} — ${approval.reason}`;
      }
    }
    const row = { scope, name, version: info.version ?? installedVersion ?? '?', license: typeof license === 'string' ? license : JSON.stringify(license ?? null), dev: !!info.dev, optional: !!info.optional, level, why, source };
    rows.push(row);
    if (level !== 'ok') {
      add({ severity: level === 'block' ? 'block' : 'warn', area: 'Licenças', file: label(key), rule: 'licenca', message: `${name}@${row.version} (${row.dev ? 'dev' : 'produção'}): ${why}` });
    }
  }

  // Pacotes instalados que não estão no lock (extraneous)
  if (installed) {
    const lockKeys = new Set(Object.keys(lock.packages ?? {}));
    const top = fs.readdirSync(nmDir).filter((d) => !d.startsWith('.'));
    for (const d of top) {
      const dirs = d.startsWith('@') && fs.statSync(path.join(nmDir, d)).isDirectory() ? fs.readdirSync(path.join(nmDir, d)).map((s) => `${d}/${s}`) : [d];
      for (const name of dirs) {
        if (!lockKeys.has(`node_modules/${name}`)) {
          add({ severity: 'warn', area: 'Licenças', file: label(`node_modules/${name}`), rule: 'fora-do-lock', message: `${name} está em node_modules mas não no package-lock.json (rode \`npm ci\`).` });
        }
      }
    }
  }
  return { rows, installed };
}

/* ----------------------------------------------------------------------------
 * a.2) Crates do desktop (Chat 09.1 · R7)
 * ------------------------------------------------------------------------- */

/** Identificador SPDX antigo com barra ("MIT/Apache-2.0") = OR; "X WITH exceção" é uma licença própria (aprovação). */
const crateLicense = (raw) => String(raw ?? '').replace(/\s*\/\s*/g, ' OR ').replace(/(\S+)\s+WITH\s+(\S+)/g, '$1-WITH-$2');

/**
 * Cargo.lock × `src-tauri/crates.json` (inventário gravado por `npm run crates`): toda crate do lock precisa estar no
 * inventário com o mesmo SHA-256, e licença fora da lista livre só passa com aprovação por nome, versão e licença
 * (`crateApprovals`). Crate nova, versão trocada ou licença não aprovada BLOQUEIA. Não precisa do cargo instalado.
 */
function auditCrates() {
  const lockPath = path.join(ROOT, 'src-tauri/Cargo.lock');
  if (!exists(lockPath)) return { rows: [] };
  const block = (rule, message, file = 'src-tauri/Cargo.lock') => add({ severity: 'block', area: 'Crates', file, rule, message });
  const inventoryPath = path.join(ROOT, 'src-tauri/crates.json');
  if (!exists(inventoryPath)) {
    block('crates-inventario', 'src-tauri/crates.json não existe (rode npm run crates)');
    return { rows: [] };
  }
  const keyOf = (c) => `${c.name}@${c.version}`;
  const inventory = new Map(readJson(inventoryPath).map((c) => [keyOf(c), c]));
  const approvals = new Map((config.licenses.crateApprovals ?? []).map((a) => [a.crate, a]));
  const lock = fs.readFileSync(lockPath, 'utf8').replace(/\r\n/g, '\n');
  const rows = [];
  const seen = new Set();
  for (const part of lock.split('[[package]]').slice(1)) {
    const field = (name) => new RegExp(`^${name} = "([^"]+)"$`, 'm').exec(part)?.[1] ?? null;
    const key = `${field('name')}@${field('version')}`;
    const source = field('source');
    if (!source) {
      if (field('name') !== 'ludraw-desktop') block('crates-origem', `${key}: crate local ou vendorizada (só o registro oficial é aceito)`);
      continue;
    }
    seen.add(key);
    if (source !== 'registry+https://github.com/rust-lang/crates.io-index') block('crates-origem', `${key}: origem ${source} (só o crates.io é aceito)`);
    const known = inventory.get(key);
    if (!known) {
      block('crates-inventario', `${key} está no Cargo.lock e não no inventário: confira a licença com o usuário e rode npm run crates`);
      continue;
    }
    if (!known.sha256 || known.sha256 !== field('checksum')) block('crates-sha256', `${key}: SHA-256 do lock diferente do inventário`);
    let { level, why } = classifyLicense(crateLicense(known.license));
    const approval = approvals.get(key);
    if (level !== 'ok' && level !== 'block' && approval?.approvedBy && approval.license === known.license) level = 'ok';
    rows.push({ ...known, level });
    if (level !== 'ok') block('crates-licenca', `${key}: ${why} — sem aprovação para esta versão e licença (crateApprovals)`);
  }
  for (const key of inventory.keys()) if (!seen.has(key)) block('crates-inventario', `${key} está no inventário e não no Cargo.lock (rode npm run crates)`, 'src-tauri/crates.json');
  for (const key of approvals.keys()) if (!seen.has(key)) block('crates-aprovacao', `aprovação de ${key} sem uso no Cargo.lock: remova a linha`, 'scripts/audit-terms.json');
  return { rows };
}

/* ----------------------------------------------------------------------------
 * b) Termos suspeitos
 * ------------------------------------------------------------------------- */

function auditTerms() {
  const compiled = config.terms.map((t) => ({ ...t, re: new RegExp(t.pattern, `${(t.flags ?? '').replace('g', '')}g`) }));
  const scopes = [
    ['ui', config.scan.ui],
    ['docs', config.scan.docs],
  ];
  let scanned = 0;
  for (const [scope, entries] of scopes) {
    for (const entry of entries) {
      for (const abs of listFiles(entry)) {
        const file = rel(abs);
        if (!TEXT_EXT.has(path.extname(abs).toLowerCase())) continue;
        if (file === 'scripts/audit-terms.json') continue;
        scanned++;
        const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
        lines.forEach((text, idx) => {
          const line = idx + 1;
          if (text.length > config.scan.maxLineLength && scope === 'ui' && !/\.(json|svg)$/.test(file)) {
            if (!exceptionFor(file, 'long-line', line)) {
              add({ severity: 'warn', area: 'Termos', file, line, rule: 'linha-longa', message: `Linha com ${text.length} caracteres: possível código minificado/colado. Revise a origem.` });
            }
          }
          for (const t of compiled) {
            const sev = t[scope] ?? 'warn';
            if (sev === 'off') continue;
            t.re.lastIndex = 0;
            const m = t.re.exec(text);
            if (!m) continue;
            const ex = exceptionFor(file, t.id, line);
            if (ex && ex.reason && String(ex.reason).trim().length >= 10) continue;
            const start = Math.max(0, m.index - 50);
            add({ severity: sev, area: 'Termos', file, line, rule: t.id, message: t.description, excerpt: text.slice(start, m.index + m[0].length + 50).trim() });
          }
        });
      }
    }
  }
  return { scanned };
}

/* ----------------------------------------------------------------------------
 * c) Assets
 * ------------------------------------------------------------------------- */

function auditAssets() {
  const provenancePath = path.join(ROOT, 'docs/PROVENANCE.md');
  const provenance = exists(provenancePath) ? fs.readFileSync(provenancePath, 'utf8') : '';
  const rootPkg = readJson(path.join(ROOT, 'package.json'));
  if (!provenance) add({ severity: 'block', area: 'Assets', file: 'docs/PROVENANCE.md', rule: 'provenance-ausente', message: 'docs/PROVENANCE.md não existe.' });
  // Registrado = caminho completo citado, `nome.ext` entre crases ou a pasta como curinga (`pasta/*`).
  const registered = (file) => {
    const base = path.basename(file);
    const dir = path.dirname(file);
    return provenance.includes(file) || provenance.includes(`\`${base}\``) || provenance.includes(`${dir}/*`);
  };
  const rows = [];
  const seen = new Set();

  // Arquivos de asset no repositório
  for (const entry of config.assets.inventoryDirs) {
    for (const abs of listFiles(entry)) {
      const file = rel(abs);
      if (!ASSET_EXT.has(path.extname(abs).toLowerCase())) continue;
      seen.add(file);
      const ok = registered(file);
      rows.push({ file, kind: 'arquivo', bytes: fs.statSync(abs).size, registered: ok });
      if (!ok) add({ severity: 'warn', area: 'Assets', file, rule: 'asset-sem-origem', message: 'Asset sem origem registrada em docs/PROVENANCE.md (CLEAN_ROOM R10).' });
    }
  }

  // Imports/referências de asset no código
  const refRe = /(?:import\s+[^'"]*from\s+|import\(\s*|url\(\s*|src=|href=|new URL\(\s*)['"]?([^'")\s]+\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp3|wav|ogg|m4a|mp4|webm))(?:\?[^'")\s]*)?['"]?/gi;
  for (const entry of [...config.scan.ui]) {
    for (const abs of listFiles(entry)) {
      if (!TEXT_EXT.has(path.extname(abs).toLowerCase())) continue;
      const file = rel(abs);
      const text = fs.readFileSync(abs, 'utf8');
      for (const m of text.matchAll(refRe)) {
        const ref = m[1];
        if (/^https?:|^data:/.test(ref)) continue;
        if (exceptionFor(file, 'asset-ref')) continue; // Chat 08.6 · O-11: fixture de teste (não é asset nem pacote)
        // Chat 05.5: referência a arquivo de pacote npm (ex.: url('@fontsource/x/files/…woff2') em src/styles/fonts.css).
        // Vale a licença do pacote (seção Licenças) e o registro do pacote em docs/PROVENANCE.md; agrupa por pacote.
        if (!/^(\.{1,2}\/|\/)/.test(ref) && file !== 'index.html') {
          const pkgName = ref.startsWith('@') ? ref.split('/').slice(0, 2).join('/') : ref.split('/')[0];
          const key = `${file} → ${pkgName}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const declared = !!(rootPkg.dependencies?.[pkgName] ?? rootPkg.devDependencies?.[pkgName]);
          const ok = provenance.includes(pkgName);
          rows.push({ file: `${pkgName} (pacote, usado em ${file})`, kind: 'referência a pacote', bytes: null, registered: ok });
          if (!declared) add({ severity: 'warn', area: 'Assets', file, rule: 'pacote-nao-declarado', message: `Referência a arquivo do pacote ${pkgName}, que não está nas dependências do package.json.` });
          else if (exists(path.join(ROOT, 'node_modules', pkgName)) && !exists(path.join(ROOT, 'node_modules', ref))) add({ severity: 'warn', area: 'Assets', file, rule: 'asset-inexistente', message: `Arquivo não encontrado no pacote instalado: ${ref}` });
          if (!ok) add({ severity: 'warn', area: 'Assets', file, rule: 'asset-sem-origem', message: `Pacote ${pkgName} sem registro em docs/PROVENANCE.md (CLEAN_ROOM R10).` });
          continue;
        }
        const resolved = ref.startsWith('/') || ref.startsWith('./') && file === 'index.html' ? rel(path.join(ROOT, 'public', ref.replace(/^\.?\//, ''))) : rel(path.resolve(path.dirname(abs), ref));
        const key = `${file} → ${ref}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ok = registered(resolved) || registered(ref);
        rows.push({ file: `${resolved} (usado em ${file})`, kind: 'referência', bytes: exists(path.join(ROOT, resolved)) ? fs.statSync(path.join(ROOT, resolved)).size : null, registered: ok });
        if (!exists(path.join(ROOT, resolved))) add({ severity: 'warn', area: 'Assets', file, rule: 'asset-inexistente', message: `Referência a asset que não existe no repositório: ${ref}` });
      }
    }
  }

  // Arquivos que não devem ser publicados (ex.: capturas antigas)
  for (const dnp of config.assets.doNotPublish ?? []) {
    // Chat 09: `allow` libera arquivos específicos (capturas novas com origem registrada); o resto da pasta continua barrado
    const allowed = new Set(dnp.allow ?? []);
    const hits = listFiles(dnp.path.replace(/\/$/, '')).filter((abs) => !allowed.has(rel(abs)));
    if (hits.length) add({ severity: 'warn', area: 'Assets', file: dnp.path, rule: 'nao-publicar', message: `${hits.length} arquivo(s): ${dnp.reason}` });
  }

  // Chat 05.5: fontes são autohospedadas (src/styles/fonts.css). Qualquer referência a servidor de fontes
  // externo no index.html ou no código da interface é bloqueante (o app tem de funcionar offline).
  const fontFamilies = [];
  const fontHostRe = /fonts\.(googleapis|gstatic)\.com/;
  for (const abs of [path.join(ROOT, 'index.html'), ...config.scan.ui.flatMap((entry) => listFiles(entry))]) {
    if (!exists(abs) || !TEXT_EXT.has(path.extname(abs).toLowerCase())) continue;
    const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (fontHostRe.test(line)) add({ severity: 'block', area: 'Assets', file: `${rel(abs)}:${i + 1}`, rule: 'fonte-externa', message: 'Referência a servidor de fontes externo. Desde o Chat 05.5 as fontes são autohospedadas (Fontsource em src/styles/fonts.css).' });
    });
  }
  for (const m of fs.readFileSync(path.join(ROOT, 'src/styles/fonts.css'), 'utf8').matchAll(/font-family:\s*'([^']+)'/g)) {
    if (!fontFamilies.includes(m[1])) fontFamilies.push(m[1]);
  }
  return { rows, fontFamilies };
}

/* ----------------------------------------------------------------------------
 * d) Domínios externos
 * ------------------------------------------------------------------------- */

function auditDomains() {
  const rows = new Map();
  const urlRe = /\b(?:https?:)?\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?(\/[^\s'"`)<>]*)?/gi;
  const kindOf = (line) => {
    if (/fetch\s*\(|axios|XMLHttpRequest|WebSocket|EventSource|sendBeacon/i.test(line)) return 'requisição (fetch/WebSocket)';
    if (/<script|\bsrc=/.test(line) && /script/i.test(line)) return 'script';
    if (/<link|rel=/.test(line)) return 'link (CSS/preconnect)';
    if (/<img|\.src\s*=|src=/.test(line)) return 'imagem';
    if (/url\(/.test(line)) return 'CSS url()';
    if (/xmlns|createElementNS/.test(line)) return 'namespace XML';
    return 'texto/link';
  };
  for (const entry of config.scan.ui) {
    for (const abs of listFiles(entry)) {
      if (!TEXT_EXT.has(path.extname(abs).toLowerCase())) continue;
      const file = rel(abs);
      fs.readFileSync(abs, 'utf8')
        .split(/\r?\n/)
        .forEach((line, i) => {
          for (const m of line.matchAll(urlRe)) {
            const host = m[1].toLowerCase();
            if (/^(localhost|127\.0\.0\.1)$/.test(host) || /\.(ts|tsx|js|css|json|md|svg|png)$/.test(host)) continue;
            const kind = kindOf(line);
            const keyName = `${host}|${kind}`;
            const row = rows.get(keyName) ?? { host, kind, uses: [], expected: expectedFor(host) };
            row.uses.push(`${file}:${i + 1}`);
            rows.set(keyName, row);
          }
        });
    }
  }
  for (const row of rows.values()) {
    if (!row.expected) {
      add({ severity: row.kind.startsWith('requisição') || row.kind === 'script' ? 'block' : 'warn', area: 'Domínios', file: row.uses[0], rule: 'dominio-inesperado', message: `${row.host} (${row.kind}) não está em "expectedDomains". Usos: ${row.uses.slice(0, 5).join(', ')}` });
    }
  }
  return { rows: [...rows.values()] };
}

/* ----------------------------------------------------------------------------
 * e) Relatório
 * ------------------------------------------------------------------------- */

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

function writeReport({ licenses, terms, assets, domains }) {
  const blocks = findings.filter((f) => f.severity === 'block');
  const warns = findings.filter((f) => f.severity === 'warn');
  const infos = findings.filter((f) => f.severity === 'info');
  const now = new Date();
  const okLic = licenses.rows.filter((r) => r.level === 'ok');
  const byLicense = new Map();
  for (const r of licenses.rows) byLicense.set(r.license, (byLicense.get(r.license) ?? 0) + 1);

  const out = [];
  out.push('# AUDIT_REPORT.md — Auditoria de Sala Limpa do LuDraw');
  out.push('');
  out.push(`> Gerado por \`npm run docs:legal\` (\`scripts/audit-clean-room.mjs --write\`; o \`npm run audit:legal\` só confere) em ${now.toISOString().slice(0, 19).replace('T', ' ')} UTC. Regras: \`ai-memory/CLEAN_ROOM.md\`; termos e exceções: \`scripts/audit-terms.json\`.`);
  out.push('> **Isto não é parecer jurídico.** É uma checagem automática de engenharia; a revisão por advogado de software está prevista no Chat 09.');
  out.push('');
  out.push('## Resumo');
  out.push('');
  out.push('| Resultado | Quantidade |');
  out.push('|---|---|');
  out.push(`| ❌ Bloqueantes | ${blocks.length} |`);
  out.push(`| ⚠️ Avisos | ${warns.length} |`);
  out.push(`| ✅ Dependências com licença permitida | ${okLic.length} de ${licenses.rows.length} |`);
  out.push(`| Arquivos de texto varridos (termos) | ${terms.scanned} |`);
  out.push(`| Assets inventariados | ${assets.rows.length} |`);
  out.push(`| Domínios externos | ${domains.rows.length} |`);
  out.push('');
  out.push(blocks.length ? '**Status: ❌ reprovado** — corrija os bloqueantes (código de saída 1).' : '**Status: ✅ sem bloqueantes** — revise os avisos.');
  if (!licenses.installed) out.push('\n> `node_modules/` não encontrado: as licenças foram lidas só do `package-lock.json`. Rode `npm ci` e repita para conferir também os `package.json` instalados.');
  out.push('');

  const table = (list) => {
    if (!list.length) return ['_Nenhum._', ''];
    const t = ['| Área | Onde | Regra | Detalhe |', '|---|---|---|---|'];
    for (const f of list) t.push(`| ${f.area} | \`${esc(f.file ?? '')}${f.line ? `:${f.line}` : ''}\` | ${esc(f.rule)} | ${esc(f.message)}${f.excerpt ? `<br>\`${esc(f.excerpt).replace(/`/g, "'")}\`` : ''} |`);
    t.push('');
    return t;
  };
  out.push('## ❌ Achados bloqueantes');
  out.push('');
  out.push(...table(blocks));
  out.push('## ⚠️ Avisos (revisar; nada é alterado sem aprovação do usuário)');
  out.push('');
  out.push(...table(warns));
  if (infos.length) {
    out.push('## ℹ️ Ajustes automáticos');
    out.push('');
    out.push(...table(infos));
  }

  out.push('## ✅ Licenças das dependências');
  out.push('');
  out.push('| Licença | Pacotes |');
  out.push('|---|---|');
  for (const [lic, n] of [...byLicense.entries()].sort((a, b) => b[1] - a[1])) out.push(`| ${esc(lic)} | ${n} |`);
  out.push('');
  out.push('<details><summary>Lista completa (pacote · versão · licença · uso)</summary>');
  out.push('');
  out.push('| Pacote | Versão | Licença | Uso | Situação |');
  out.push('|---|---|---|---|---|');
  for (const r of [...licenses.rows].sort((a, b) => a.name.localeCompare(b.name))) {
    out.push(`| ${esc(r.name)} | ${esc(r.version)} | ${esc(r.license)} | ${r.scope ? 'servidor · ' : ''}${r.dev ? 'dev' : 'produção'}${r.optional ? ' (opcional)' : ''} | ${r.level === 'ok' ? '✅' : r.level === 'warn' ? '⚠️' : '❌'} |`);
  }
  out.push('');
  out.push('</details>');
  out.push('');

  out.push('## Assets');
  out.push('');
  out.push('| Asset | Tipo | Tamanho | Origem registrada |');
  out.push('|---|---|---|---|');
  for (const a of assets.rows) out.push(`| \`${esc(a.file)}\` | ${a.kind} | ${a.bytes == null ? '—' : `${(a.bytes / 1024).toFixed(1)} KB`} | ${a.registered ? '✅' : '⚠️ não'} |`);
  out.push('');

  out.push('## Domínios externos no código');
  out.push('');
  out.push('| Domínio | Uso | Esperado? | Onde |');
  out.push('|---|---|---|---|');
  for (const d of domains.rows) out.push(`| ${esc(d.host)} | ${esc(d.kind)} | ${d.expected ? `✅ ${esc(d.expected)}` : '⚠️ não'} | ${esc(d.uses.slice(0, 4).join(', '))}${d.uses.length > 4 ? ` (+${d.uses.length - 4})` : ''} |`);
  out.push('');

  out.push('## Exceções aplicadas (`scripts/audit-terms.json`)');
  out.push('');
  out.push('| Arquivo | Termo | Linha | Justificativa |');
  out.push('|---|---|---|---|');
  for (const ex of config.exceptions ?? []) out.push(`| \`${esc(ex.file)}\` | ${esc(ex.term)} | ${ex.line ?? 'todas'} | ${esc(ex.reason)} |`);
  out.push('');
  if ((config.manualReview ?? []).length) {
    out.push('## Revisão manual — semelhança com produtos de terceiros');
    out.push('');
    out.push('Levantada por leitura do código, textos de interface, nomes de recursos e ícones (lista mantida em `scripts/audit-terms.json` → `manualReview`). Nada foi alterado sem decisão do usuário.');
    out.push('');
    out.push('| Item | Risco | Observação | Decisão |');
    out.push('|---|---|---|---|');
    for (const m of config.manualReview) out.push(`| ${esc(m.item)} | ${esc(m.risk)} | ${esc(m.note)} | ${esc(m.decision)} |`);
    out.push('');
  }
  out.push('## Passos manuais recomendados (fora do repositório)');
  out.push('');
  out.push('- `scancode-toolkit` para detectar trechos de licença/copyright em todo o código.');
  out.push('- `jscpd` para similaridade/duplicação de código.');
  out.push('- Revisão humana das telas contra o `DESIGN_REDESIGN.md` (auditoria de look and feel no Chat 09).');
  out.push('');

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  if (WRITE) fs.writeFileSync(REPORT, `${out.join('\n')}\n`);
  return { blocks, warns };
}

/* ----------------------------------------------------------------------------
 * e) Origem versionada (Chat 08.6 · C, O-01)
 * ------------------------------------------------------------------------- */

/**
 * As provas de origem que ficam em ai-memory/ (regras de sala limpa e referências de desenho dos ícones e da
 * splash) são versionadas e têm o SHA-256 registrado no PROVENANCE ("| `ai-memory/…` | `<sha256>` |").
 */
function auditOriginHashes() {
  const provPath = path.join(ROOT, 'docs/PROVENANCE.md');
  if (!exists(provPath)) return { rows: 0 };
  const prov = fs.readFileSync(provPath, 'utf8');
  const rows = [...prov.matchAll(/^\|\s*`(ai-memory\/[^`]+)`\s*\|\s*`([0-9a-f]{64})`/gm)];
  const listed = new Set();
  for (const [, file, sha] of rows) {
    listed.add(file);
    const abs = path.join(ROOT, file);
    if (!exists(abs)) {
      add({ severity: 'block', area: 'Origem', file: 'docs/PROVENANCE.md', rule: 'origem-hash', message: `${file} está registrado no PROVENANCE, mas o arquivo não existe` });
      continue;
    }
    const real = createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    if (real === sha) continue;
    if (file === 'ai-memory/CLEAN_ROOM.md') add({ severity: 'warn', area: 'Origem', file, rule: 'origem-hash', message: `mudou desde o último registro (SHA-256 ${real.slice(0, 12)}…): atualize o hash no docs/PROVENANCE.md — obrigatório a cada fechamento` });
    else add({ severity: 'block', area: 'Origem', file, rule: 'origem-hash', message: `referência de origem alterada: SHA-256 ${real.slice(0, 12)}… ≠ registrado ${sha.slice(0, 12)}… (referência é prova de origem; mudança só com decisão registrada e hash novo)` });
  }
  const refsDir = path.join(ROOT, 'ai-memory/refs');
  const required = ['ai-memory/CLEAN_ROOM.md', ...(exists(refsDir) ? fs.readdirSync(refsDir).map((n) => `ai-memory/refs/${n}`) : [])];
  for (const file of required) {
    if (exists(path.join(ROOT, file)) && !listed.has(file)) add({ severity: 'block', area: 'Origem', file, rule: 'origem-hash', message: 'prova de origem versionada sem SHA-256 registrado no docs/PROVENANCE.md' });
  }
  return { rows: rows.length };
}

/* ----------------------------------------------------------------------------
 * f) Avisos de terceiros (Chat 08.6 · D, O-02)
 * ------------------------------------------------------------------------- */

function auditNotices() {
  let checked = 0;
  for (const target of NOTICE_TARGETS) {
    let expected;
    try {
      expected = buildNotices(ROOT, target);
    } catch (err) {
      add({ severity: 'block', area: 'Avisos', file: target.out, rule: 'avisos-terceiros', message: `não foi possível gerar os avisos: ${err.message}` });
      continue;
    }
    checked++;
    const file = path.join(ROOT, target.out);
    const current = exists(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current === null) add({ severity: 'block', area: 'Avisos', file: target.out, rule: 'avisos-terceiros', message: 'arquivo de avisos de terceiros não existe — rode npm run notices' });
    else if (current !== expected) add({ severity: 'block', area: 'Avisos', file: target.out, rule: 'avisos-terceiros', message: 'avisos de terceiros desatualizados em relação ao package-lock.json — rode npm run notices' });
    // build existente precisa levar os avisos (o plugin do Vite e o server/scripts/build.mjs copiam)
    const distDir = path.join(ROOT, path.dirname(target.dist));
    if (exists(distDir)) {
      const distFile = path.join(ROOT, target.dist);
      const inDist = exists(distFile) ? fs.readFileSync(distFile, 'utf8').replace(/\r\n/g, '\n') : null;
      if (inDist === null) add({ severity: 'block', area: 'Avisos', file: target.dist, rule: 'avisos-terceiros', message: 'o build existe, mas sem os avisos de terceiros — refaça o build' });
      else if (inDist !== expected) add({ severity: 'block', area: 'Avisos', file: target.dist, rule: 'avisos-terceiros', message: 'o build traz avisos de terceiros diferentes dos atuais — refaça o build' });
    }
  }
  // Chat 09.1 · R8: avisos do programa desktop (crates do executável + instalador), conferidos sem o cargo
  if (exists(path.join(ROOT, 'src-tauri/crates.json'))) {
    const problem = checkDesktopNotices(ROOT);
    if (problem) add({ severity: 'block', area: 'Avisos', file: DESKTOP_NOTICES, rule: 'avisos-terceiros', message: `avisos do desktop: ${problem}` });
    else checked++;
  }
  return { checked };
}

/* ----------------------------------------------------------------------------
 * Execução
 * ------------------------------------------------------------------------- */

validateExceptions();
const licenses = auditLicenses();
const crates = auditCrates();
const terms = auditTerms();
const assets = auditAssets();
const domains = auditDomains();
auditOriginHashes();
auditNotices();
const { blocks, warns } = writeReport({ licenses, terms, assets, domains });

if (!QUIET) {
  const line = (f) => `  - [${f.area}] ${f.file ?? ''}${f.line ? `:${f.line}` : ''} — ${f.rule}: ${f.message}`;
  console.log(`Auditoria de Sala Limpa — ${blocks.length} bloqueante(s), ${warns.length} aviso(s). ${WRITE ? `Relatório: ${rel(REPORT)}` : 'Só leitura (relatório: npm run docs:legal).'}`);
  if (blocks.length) console.log(`\nBloqueantes:\n${blocks.map(line).join('\n')}`);
  if (warns.length) console.log(`\nAvisos:\n${warns.map(line).join('\n')}`);
}
process.exitCode = blocks.length ? 1 : 0;
