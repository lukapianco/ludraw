// LuDraw — E04 "Contador de palavras" (Chat 06.5 · B). Escrito do zero; licença MIT.
// Roda num Web Worker isolado: só conversa com o app pela API `ludraw.*`.
// Permissões: board.read (ler a seleção) e ui.command (o item no Ctrl+K). Não escreve no board.
'use strict';

var TEXT = {
  'pt-BR': {
    none: 'Selecione um ou mais post-its para contar as palavras.',
    words: function (n) { return n === 1 ? '1 palavra' : n + ' palavras'; },
    notes: function (n) { return n === 1 ? '1 post-it' : n + ' post-its'; },
    result: function (w, n) { return w + ' em ' + n + '.'; },
    hidden: function (n) { return n === 1 ? ' 1 nota privada de outra pessoa não foi contada.' : ' ' + n + ' notas privadas de outras pessoas não foram contadas.'; },
  },
  en: {
    none: 'Select one or more sticky notes to count their words.',
    words: function (n) { return n === 1 ? '1 word' : n + ' words'; },
    notes: function (n) { return n === 1 ? '1 sticky note' : n + ' sticky notes'; },
    result: function (w, n) { return w + ' in ' + n + '.'; },
    hidden: function (n) { return n === 1 ? ' 1 private note from someone else was not counted.' : ' ' + n + ' private notes from other people were not counted.'; },
  },
};

function strings() {
  var locale = ludraw.locale || 'pt-BR';
  return TEXT[locale] || TEXT[locale.split('-')[0]] || TEXT['pt-BR'];
}

/** Palavras = sequências de letras/números (com hífen ou apóstrofo no meio), em qualquer idioma. */
function countWords(text) {
  var found = String(text || '').match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return found ? found.length : 0;
}

ludraw.ui.registerCommand({
  id: 'contar',
  run: async function () {
    var s = strings();
    var selection = await ludraw.board.getSelection();
    var notes = selection.filter(function (el) { return el.type === 'sticky'; });
    if (!notes.length) {
      await ludraw.ui.notify(s.none, 'info');
      return;
    }
    var hidden = 0;
    var words = 0;
    notes.forEach(function (el) {
      if (el.hidden) hidden += 1;
      else words += countWords(el.text);
    });
    var visible = notes.length - hidden;
    var message = s.result(s.words(words), s.notes(visible)) + (hidden ? s.hidden(hidden) : '');
    await ludraw.ui.notify(message, 'success');
  },
});
