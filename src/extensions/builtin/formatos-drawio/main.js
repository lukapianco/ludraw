// LuDraw — E05 "Formatos de diagrama abertos (.drawio)" (Chat 06.5 · B). Escrito do zero; licença MIT.
//
// Decisão registrada em CLEAN_ROOM.md §8 (05/11/2026): o .drawio é um formato ABERTO e documentado
// (XML). Este importador foi escrito a partir da descrição pública do formato — elementos `mxfile` ›
// `diagram` › `mxGraphModel` › `root` › `mxCell` com `mxGeometry`, estilos `chave=valor;` e página
// compactada (deflate "cru" + base64 + codificação de URL) — e testado com arquivos de exemplo
// próprios. Nenhum código-fonte do programa foi lido; não lê a área de transferência de outros
// editores; não usa rede nem API de terceiros.
//
// Roda num Web Worker isolado. Permissões: files.import — receber o arquivo escolhido por você — e
// board.write (os objetos entram no board pelo host, com as suas permissões e 1 passo de desfazer).
'use strict';

var LIMITS = { inflatedBytes: 20 * 1024 * 1024, cells: 5000, depth: 64, coord: 45000, size: 19000 };

var TEXT = {
  'pt-BR': {
    pages: function (n) { return n === 1 ? 'O arquivo tem mais 1 página: só a primeira foi importada.' : 'O arquivo tem mais ' + n + ' páginas: só a primeira foi importada.'; },
    approx: function (n, names) { return (n === 1 ? '1 forma sem equivalente virou retângulo' : n + ' formas sem equivalente viraram retângulo') + (names && names.length ? ' (' + names.join(', ') + ').' : '.'); },
    images: function (n) { return n === 1 ? '1 imagem foi ignorada (imagens não são importadas deste formato).' : n + ' imagens foram ignoradas (imagens não são importadas deste formato).'; },
    tooMany: function (n) { return 'O diagrama passa de ' + n + ' objetos: o restante foi ignorado.'; },
    tooBig: function (n) { return n === 1 ? '1 objeto fora dos limites de tamanho foi ignorado.' : n + ' objetos fora dos limites de tamanho foram ignorados.'; },
    invalid: 'Este arquivo não parece um diagrama .drawio válido.',
    empty: 'O diagrama está vazio.',
  },
  en: {
    pages: function (n) { return n === 1 ? 'The file has 1 more page: only the first one was imported.' : 'The file has ' + n + ' more pages: only the first one was imported.'; },
    approx: function (n, names) { return (n === 1 ? '1 shape with no equivalent became a rectangle' : n + ' shapes with no equivalent became rectangles') + (names && names.length ? ' (' + names.join(', ') + ').' : '.'); },
    images: function (n) { return n === 1 ? '1 image was skipped (images aren’t imported from this format).' : n + ' images were skipped (images aren’t imported from this format).'; },
    tooMany: function (n) { return 'The diagram has more than ' + n + ' objects: the rest was skipped.'; },
    tooBig: function (n) { return n === 1 ? '1 object outside the size limits was skipped.' : n + ' objects outside the size limits were skipped.'; },
    invalid: 'This file doesn’t look like a valid .drawio diagram.',
    empty: 'The diagram is empty.',
  },
};

function strings() {
  var locale = (typeof ludraw !== 'undefined' && ludraw.locale) || 'pt-BR';
  return TEXT[locale] || TEXT[locale.split('-')[0]] || TEXT['pt-BR'];
}

/* ------------------------------ XML (leitor próprio) ------------------------------ */
// Os mapas usam Object.create(null): ids e chaves vindos do arquivo nunca colidem com o protótipo.

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|amp|lt|gt|quot|apos|nbsp);/g, function (_, e) {
    if (e === 'amp') return '&';
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    if (e === 'nbsp') return ' ';
    var code = e.charAt(1) === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

function node(name) {
  return { name: name, attrs: Object.create(null), children: [], text: '' };
}

/** XML → árvore simples. Recusa DOCTYPE/ENTITY (sem expansão de entidades externas). */
function parseXml(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('doctype');
  var root = node('#document');
  var stack = [root];
  var re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<\/([A-Za-z_][\w:.-]*)\s*>|<([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  var attrRe = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  var last = 0;
  var count = 0;
  var m;
  while ((m = re.exec(text))) {
    if (m.index !== last) throw new Error('xml');
    last = re.lastIndex;
    var top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[2] !== undefined) {
      if (stack.length < 2 || top.name !== m[2]) throw new Error('xml');
      stack.pop();
    } else if (m[3] !== undefined) {
      if (++count > LIMITS.cells * 6) throw new Error('size');
      var el = node(m[3]);
      var a;
      attrRe.lastIndex = 0;
      while ((a = attrRe.exec(m[4]))) el.attrs[a[1]] = decodeEntities(a[2] !== undefined ? a[2] : a[3]);
      top.children.push(el);
      if (!m[5]) {
        if (stack.length > LIMITS.depth) throw new Error('depth');
        stack.push(el);
      }
    } else if (m[6] !== undefined) top.text += decodeEntities(m[6]);
  }
  if (last !== text.length || stack.length !== 1) throw new Error('xml');
  return root;
}

function firstChild(n, name) {
  for (var i = 0; i < n.children.length; i++) if (!name || n.children[i].name === name) return n.children[i];
  return null;
}

/* --------------------------- Página compactada --------------------------- */

async function inflatePage(b64) {
  var bin = atob(b64.replace(/\s+/g, ''));
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  var reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  var chunks = [];
  var total = 0;
  for (;;) {
    var r = await reader.read();
    if (r.done) break;
    total += r.value.byteLength;
    if (total > LIMITS.inflatedBytes) {
      await reader.cancel();
      throw new Error('size');
    }
    chunks.push(r.value);
  }
  var out = new Uint8Array(total);
  var o = 0;
  chunks.forEach(function (c) { out.set(c, o); o += c.byteLength; });
  var textOut = new TextDecoder().decode(out);
  try {
    return decodeURIComponent(textOut);
  } catch (_e) {
    return textOut;
  }
}

/** Arquivo → lista de páginas (`mxGraphModel`). */
async function readPages(text) {
  var doc = parseXml(text);
  var top = firstChild(doc);
  if (!top) throw new Error('empty');
  if (top.name === 'mxGraphModel') return [top];
  if (top.name !== 'mxfile') throw new Error('format');
  var pages = [];
  var diagrams = top.children.filter(function (c) { return c.name === 'diagram'; });
  for (var i = 0; i < diagrams.length; i++) {
    var d = diagrams[i];
    var model = firstChild(d, 'mxGraphModel');
    if (!model && d.text.trim()) model = firstChild(parseXml(await inflatePage(d.text.trim())), 'mxGraphModel');
    if (model) pages.push(model);
    if (i === 0 && !model) throw new Error('format');
  }
  return pages;
}

/* ------------------------------ Estilos e textos ------------------------------ */

function parseStyle(s) {
  var map = Object.create(null);
  map._names = [];
  String(s || '').split(';').forEach(function (part) {
    if (!part) return;
    var eq = part.indexOf('=');
    if (eq < 0) map._names.push(part.trim());
    else if (part.slice(0, eq).trim() !== '_names') map[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  });
  return map;
}

function hasName(st, n) {
  return st._names.indexOf(n) >= 0 || st.shape === n;
}

/** Rótulo (com HTML quando `html=1`) → texto puro. */
function labelText(value, st) {
  var v = String(value || '');
  if (st.html === '1' || /<[a-z][\s\S]*>/i.test(v)) {
    v = v.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li|h[1-6])>/gi, '\n').replace(/<[^>]*>/g, '');
    v = decodeEntities(v);
  }
  return v.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 5000);
}

function color(v) {
  if (!v || v === 'default' || v === 'inherit') return undefined;
  if (v === 'none') return 'none';
  var m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(v);
  if (!m) return undefined;
  var h = m[1].length === 3 ? m[1].split('').map(function (c) { return c + c; }).join('') : m[1];
  return '#' + h.toUpperCase();
}

function num(v, min, max, fallback) {
  var n = parseFloat(v);
  if (!isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Forma do núcleo mais próxima (o resto vira retângulo, com aviso que cita o nome da forma). */
function kindOf(st, counters) {
  if (hasName(st, 'text') || hasName(st, 'edgeLabel')) return 'text';
  if (hasName(st, 'image') || st.image) return 'image';
  if (hasName(st, 'ellipse') || hasName(st, 'doubleEllipse') || /ellipse$/i.test(st.shape || '')) return 'circle';
  if (hasName(st, 'rhombus') || /decision$/i.test(st.shape || '')) return 'diamond';
  if (hasName(st, 'triangle')) return 'triangle';
  if (hasName(st, 'hexagon')) return 'hexagon';
  if (hasName(st, 'cylinder') || hasName(st, 'cylinder3') || hasName(st, 'datastore') || /database$/i.test(st.shape || '')) return 'cylinder';
  if (hasName(st, 'parallelogram') || /data$/i.test(st.shape || '')) return 'parallelogram';
  if (hasName(st, 'cloud')) return 'cloud';
  if (hasName(st, 'callout')) return 'speech_bubble';
  if (hasName(st, 'star') || /star$/i.test(st.shape || '')) return 'star';
  if (st.rounded === '1' || /terminator$/i.test(st.shape || '')) return 'rounded_rectangle';
  if (!st.shape || hasName(st, 'rectangle') || hasName(st, 'process') || hasName(st, 'swimlane') || /process$/i.test(st.shape)) return 'rectangle';
  counters.approx += 1;
  var name = String(st.shape).replace(/^mxgraph\./, '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 30);
  if (name && counters.approxNames.indexOf(name) < 0) counters.approxNames.push(name);
  return 'rectangle';
}

/** Lado do retângulo mais perto de um ponto relativo (0–1), como `exitX/exitY` do arquivo. */
function sideOfRelative(fx, fy) {
  var d = [['left', fx], ['right', 1 - fx], ['top', fy], ['bottom', 1 - fy]];
  d.sort(function (a, b) { return a[1] - b[1]; });
  return d[0][0];
}

/** Lado do retângulo voltado para um ponto do mundo. */
function sideToward(r, p) {
  var dx = p.x - (r.x + r.width / 2);
  var dy = p.y - (r.y + r.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

function center(r) {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

function anchorPoint(r, side) {
  if (side === 'left') return { x: r.x, y: r.y + r.height / 2 };
  if (side === 'right') return { x: r.x + r.width, y: r.y + r.height / 2 };
  if (side === 'top') return { x: r.x + r.width / 2, y: r.y };
  return { x: r.x + r.width / 2, y: r.y + r.height };
}

/**
 * Linha em cotovelo com pontos: garante que todo trecho seja horizontal ou vertical, inclusive o
 * primeiro (da forma de saída) e o último (até a forma de entrada), inserindo cantos onde faltam.
 * Sem isso, um lado de saída que não "enxerga" o primeiro ponto vira um trecho inclinado.
 */
function orthogonalize(points, start, startSide, end, endSide) {
  function corner(a, b, horizontalFirst) {
    return horizontalFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  }
  var out = [];
  var prev = start;
  var horizontal = startSide === 'left' || startSide === 'right' || !startSide;
  points.forEach(function (p) {
    if (prev.x !== p.x && prev.y !== p.y) out.push(corner(prev, p, horizontal));
    out.push({ x: p.x, y: p.y });
    var last = out.length > 1 ? out[out.length - 2] : prev;
    horizontal = last.y !== p.y ? true : false;
    prev = p;
  });
  if (prev.x !== end.x && prev.y !== end.y) {
    // chega pela direção do lado de entrada: lado esquerdo/direito = último trecho horizontal
    var endHorizontal = endSide === 'left' || endSide === 'right';
    var before = out.length > 1 ? out[out.length - 2] : start;
    var lastPt = out[out.length - 1];
    // o último trecho já anda no eixo certo: só realinha o ponto final (sem "dente" de volta)
    if (lastPt && endHorizontal && before.x === lastPt.x) lastPt.y = end.y;
    else if (lastPt && !endHorizontal && before.y === lastPt.y) lastPt.x = end.x;
    else out.push(endHorizontal ? { x: prev.x, y: end.y } : { x: end.x, y: prev.y });
  }
  var clean = [];
  out.forEach(function (p) {
    var q = clean[clean.length - 1];
    if (!q || q.x !== p.x || q.y !== p.y) clean.push({ x: Math.round(p.x), y: Math.round(p.y) });
  });
  return clean.slice(0, 50);
}

var OUTWARD = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };
var NEXT_SIDE = { bottom: 'left', left: 'top', top: 'right', right: 'bottom' };

/* ------------------------------ Modelo → objetos ------------------------------ */

function convert(model, s) {
  var root = firstChild(model, 'root');
  if (!root) throw new Error('format');
  var warnings = [];
  var counters = { approx: 0, approxNames: [], images: 0, tooBig: 0 };
  var cells = Object.create(null);
  var order = [];

  // mxCell direto, ou embrulhado em <UserObject>/<object> (o rótulo fica no embrulho)
  root.children.forEach(function (c) {
    var cell = c;
    var label;
    if (c.name === 'UserObject' || c.name === 'object') {
      cell = firstChild(c, 'mxCell');
      if (!cell) return;
      label = c.attrs.label;
      if (c.attrs.id && !cell.attrs.id) cell.attrs.id = c.attrs.id;
    } else if (c.name !== 'mxCell') return;
    var id = cell.attrs.id;
    if (!id || cells[id]) return;
    var geo = firstChild(cell, 'mxGeometry');
    cells[id] = { id: id, el: cell, value: label !== undefined ? label : cell.attrs.value, style: parseStyle(cell.attrs.style), parent: cell.attrs.parent, vertex: cell.attrs.vertex === '1', edge: cell.attrs.edge === '1', geo: geo };
    order.push(id);
  });
  if (order.length > LIMITS.cells) {
    warnings.push(s.tooMany(LIMITS.cells));
    order = order.slice(0, LIMITS.cells);
  }

  function isGroup(c) {
    return !!c && c.vertex && hasName(c.style, 'group');
  }

  // vértices que têm vértices filhos (grupos e contêineres)
  var hasChildren = Object.create(null);
  order.forEach(function (id) {
    var c = cells[id];
    if (c.vertex && c.parent && cells[c.parent] && cells[c.parent].vertex) hasChildren[c.parent] = true;
  });

  // grupo mais externo de cada célula → chave local de grupo do LuDraw
  var groupSeq = Object.create(null);
  var nextGroup = 0;
  function groupKey(id) {
    var key;
    var cur = cells[id] && cells[id].parent;
    for (var d = 0; cur && cells[cur] && d < LIMITS.depth; d++) {
      if (isGroup(cells[cur])) {
        if (!groupSeq[cur]) groupSeq[cur] = 'g' + nextGroup++;
        key = groupSeq[cur];
      }
      cur = cells[cur].parent;
    }
    return key;
  }

  // posição absoluta: geometria somada à dos pais que são vértices (grupos e contêineres)
  var absCache = Object.create(null);
  function abs(id, depth) {
    if (depth > LIMITS.depth) return { x: 0, y: 0 };
    if (absCache[id]) return absCache[id];
    var c = cells[id];
    var out = { x: 0, y: 0 };
    if (c && c.vertex) {
      var base = c.parent ? abs(c.parent, depth + 1) : { x: 0, y: 0 };
      out = { x: base.x + num(c.geo && c.geo.attrs.x, -1e6, 1e6, 0), y: base.y + num(c.geo && c.geo.attrs.y, -1e6, 1e6, 0) };
    }
    absCache[id] = out;
    return out;
  }

  var elements = [];
  var refOf = Object.create(null);
  var rectOf = Object.create(null);
  var seq = 0;
  var edgeLabels = Object.create(null);

  // rótulos de aresta que vêm como filhos da aresta
  order.forEach(function (id) {
    var c = cells[id];
    if (c.vertex && c.parent && cells[c.parent] && cells[c.parent].edge) {
      var t = labelText(c.value, c.style);
      if (t) edgeLabels[c.parent] = (edgeLabels[c.parent] ? edgeLabels[c.parent] + ' ' : '') + t;
    }
  });

  order.forEach(function (id) {
    var c = cells[id];
    if (!c.vertex || !c.geo) return;
    if (c.parent && cells[c.parent] && cells[c.parent].edge) return;
    if (isGroup(c)) return; // o grupo não tem desenho: vira o agrupamento dos filhos
    var kind = kindOf(c.style, counters);
    if (kind === 'image') {
      counters.images += 1;
      return;
    }
    var text = labelText(c.value, c.style);
    // contêiner (raia ou contêiner com filhos ou com título) vira quadro; vazio e sem título, retângulo
    var container = hasName(c.style, 'swimlane') || c.style.container === '1';
    if (container && (hasChildren[id] || text)) kind = 'frame';
    var p = abs(id, 0);
    var w = num(c.geo.attrs.width, 0, 1e6, 0);
    var h = num(c.geo.attrs.height, 0, 1e6, 0);
    if (w < 1 || h < 1 || w > LIMITS.size || h > LIMITS.size || Math.abs(p.x) > LIMITS.coord || Math.abs(p.y) > LIMITS.coord) {
      counters.tooBig += 1;
      return;
    }
    var ref = 'c' + seq++;
    var group = groupKey(id);
    var base = { ref: ref, x: Math.round(p.x), y: Math.round(p.y), width: Math.round(w), height: Math.round(h) };
    if (group) base.group = group;
    var fill = color(c.style.fillColor);
    var stroke = color(c.style.strokeColor);
    var fontColor = color(c.style.fontColor);
    var fontSize = num(c.style.fontSize, 6, 200, undefined);
    if (kind === 'text') {
      if (!text) return;
      var t = Object.assign({ type: 'text', text: text }, base);
      if (fontSize) t.fontSize = fontSize;
      if (fontColor && fontColor !== 'none') t.color = fontColor;
      if (c.style.align === 'center' || c.style.align === 'right') t.align = c.style.align;
      if (c.style.fontStyle && (parseInt(c.style.fontStyle, 10) & 1)) t.bold = true;
      refOf[id] = ref;
      rectOf[id] = base;
      elements.push(t);
      return;
    }
    refOf[id] = ref;
    rectOf[id] = base;
    if (kind === 'frame') {
      var f = Object.assign({ type: 'frame', title: text.slice(0, 200) }, base);
      f.fillColor = fill && fill !== 'none' ? fill : 'none';
      elements.push(f);
      return;
    }
    // rótulo fora da forma (ex.: boneco com o nome embaixo): texto separado, agrupado com a forma
    var outside = !!text && (c.style.verticalLabelPosition === 'bottom' || c.style.verticalLabelPosition === 'top');
    var shape = Object.assign({ type: 'shape', shape: kind, text: outside ? '' : text }, base);
    // raia vazia não tem preenchimento por padrão
    shape.fillColor = fill === undefined ? (hasName(c.style, 'swimlane') ? 'none' : '#FFFFFF') : fill;
    shape.strokeColor = stroke === undefined ? '#1C1C1E' : stroke;
    if (fontColor && fontColor !== 'none') shape.textColor = fontColor;
    shape.strokeWidth = num(c.style.strokeWidth, 0, 24, 1);
    if (fontSize) shape.fontSize = fontSize;
    elements.push(shape);
    if (outside) {
      var fs = fontSize || 14;
      var lines = text.split('\n');
      var longest = lines.reduce(function (m, l) { return Math.max(m, l.length); }, 0);
      var lw = Math.max(Math.round(w), Math.min(400, Math.round(longest * fs * 0.65) + 24));
      var lh = Math.round(fs * 1.5 * Math.min(10, lines.length)) + 8;
      var below = c.style.verticalLabelPosition === 'bottom';
      var label = { type: 'text', ref: 'c' + seq++, text: text, align: 'center', width: lw, height: lh, x: Math.round(p.x + w / 2 - lw / 2), y: below ? Math.round(p.y + h + 2) : Math.round(p.y - lh - 2) };
      label.fontSize = fs;
      if (fontColor && fontColor !== 'none') label.color = fontColor;
      var lg = group || 'l' + ref;
      shape.group = lg;
      label.group = lg;
      elements.push(label);
    }
  });

  order.forEach(function (id) {
    var c = cells[id];
    if (!c.edge) return;
    var parentAbs = c.parent ? abs(c.parent, 0) : { x: 0, y: 0 };
    function toWorld(pt) {
      return { x: Math.round(parentAbs.x + num(pt.attrs.x, -1e6, 1e6, 0)), y: Math.round(parentAbs.y + num(pt.attrs.y, -1e6, 1e6, 0)) };
    }
    function point(as) {
      if (!c.geo) return null;
      var pt = c.geo.children.filter(function (k) { return k.name === 'mxPoint' && k.attrs.as === as; })[0];
      return pt ? toWorld(pt) : null;
    }
    var points = [];
    if (c.geo) {
      var list = c.geo.children.filter(function (k) { return k.name === 'Array' && k.attrs.as === 'points'; })[0];
      if (list) points = list.children.filter(function (k) { return k.name === 'mxPoint'; }).slice(0, 50).map(toWorld);
    }
    var st = c.style;
    var srcId = c.el.attrs.source && refOf[c.el.attrs.source] ? c.el.attrs.source : null;
    var tgtId = c.el.attrs.target && refOf[c.el.attrs.target] ? c.el.attrs.target : null;
    var from = srcId ? { ref: refOf[srcId] } : point('sourcePoint');
    var to = tgtId ? { ref: refOf[tgtId] } : point('targetPoint');
    if (!from || !to) return;
    var outOfRange = [from, to].concat(points).some(function (q) { return q.x !== undefined && (Math.abs(q.x) > LIMITS.coord || Math.abs(q.y) > LIMITS.coord); });
    if (outOfRange) {
      counters.tooBig += 1;
      return;
    }
    var srcRect = srcId ? rectOf[srcId] : null;
    var tgtRect = tgtId ? rectOf[tgtId] : null;
    var fromPt = srcRect ? center(srcRect) : from;
    var toPt = tgtRect ? center(tgtRect) : to;
    // lado de saída e de entrada: o do arquivo (exitX/exitY, entryX/entryY) ou o voltado para o outro lado
    if (srcRect) {
      from.anchor = st.exitX !== undefined && st.exitY !== undefined ? sideOfRelative(num(st.exitX, -1, 2, 0.5), num(st.exitY, -1, 2, 0.5)) : sideToward(srcRect, points.length ? points[0] : toPt);
    }
    if (tgtRect) {
      to.anchor = st.entryX !== undefined && st.entryY !== undefined ? sideOfRelative(num(st.entryX, -1, 2, 0.5), num(st.entryY, -1, 2, 0.5)) : sideToward(tgtRect, points.length ? points[points.length - 1] : fromPt);
    }
    var route = st.curved === '1' ? 'curved' : /orthogonal|elbow|entityRelation/i.test(st.edgeStyle || '') ? 'orthogonal' : 'straight';
    // laço (sai e volta na mesma forma) sem pontos: desenha uma volta por fora
    if (srcId && srcId === tgtId && !points.length) {
      if (to.anchor === from.anchor || st.entryX === undefined) to.anchor = NEXT_SIDE[from.anchor];
      var gap = 24;
      var a = anchorPoint(srcRect, from.anchor);
      var b = anchorPoint(srcRect, to.anchor);
      var p1 = { x: a.x + OUTWARD[from.anchor].x * gap, y: a.y + OUTWARD[from.anchor].y * gap };
      var p3 = { x: b.x + OUTWARD[to.anchor].x * gap, y: b.y + OUTWARD[to.anchor].y * gap };
      var vertical = from.anchor === 'top' || from.anchor === 'bottom';
      points = [p1, vertical ? { x: p3.x, y: p1.y } : { x: p1.x, y: p3.y }, p3].map(function (q) { return { x: Math.round(q.x), y: Math.round(q.y) }; });
      route = 'orthogonal';
    } else if (route === 'orthogonal' && points.length) {
      points = orthogonalize(points, srcRect ? anchorPoint(srcRect, from.anchor) : from, from.anchor, tgtRect ? anchorPoint(tgtRect, to.anchor) : to, to.anchor);
    }
    var label = [labelText(c.value, st), edgeLabels[id] || ''].filter(Boolean).join(' ').slice(0, 1000);
    var conn = { type: 'connector', x: 0, y: 0, width: 0, height: 0, from: from, to: to, route: route, arrow: st.endArrow !== 'none' };
    if (points.length) conn.points = points;
    if (label) conn.label = label;
    var eg = groupKey(id);
    if (eg) conn.group = eg;
    elements.push(conn);
  });

  if (counters.approx) warnings.push(s.approx(counters.approx, counters.approxNames.slice(0, 5)));
  if (counters.images) warnings.push(s.images(counters.images));
  if (counters.tooBig) warnings.push(s.tooBig(counters.tooBig));
  return { elements: elements, warnings: warnings };
}

/** Importa o texto de um arquivo .drawio (exportado para os testes automáticos). */
async function importDrawio(text) {
  var s = strings();
  var pages;
  try {
    pages = await readPages(text);
  } catch (_e) {
    throw new Error(s.invalid);
  }
  if (!pages.length) throw new Error(s.invalid);
  var result = convert(pages[0], s);
  if (pages.length > 1) result.warnings.unshift(s.pages(pages.length - 1));
  if (!result.elements.length) throw new Error(s.empty);
  return result;
}

ludraw.files.onImport('drawio', async function (file) {
  var text = new TextDecoder('utf-8').decode(file.bytes);
  return importDrawio(text);
});
