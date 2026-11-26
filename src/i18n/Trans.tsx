/**
 * LuDraw i18n — texto com marcação segura (Chat 05.6 · I18N_SPEC §2).
 *
 * A mensagem pode ter `<b>…</b>`, `<kbd>…</kbd>` e `<link>…</link>` (e outros nomes, só se o
 * componente for passado em `components`; marcas autofechadas como `<br/>` também). Nada vira HTML: a mensagem é lida como texto e montada
 * em elementos React — sem `dangerouslySetInnerHTML`. Parâmetros (`{nome}`) entram como texto ou
 * como nós React (ícones, links), nunca são interpretados como marcação.
 *
 * ```tsx
 * <Trans k="board.hints.pan" components={{ kbd: (c) => <kbd className="od-kbd">{c}</kbd> }} />
 * ```
 */
import { Fragment, type ReactNode } from 'react';
import { rawMessage, translateMessage, type MessageDescriptor, type TKey } from './index';
import { useLocale } from './useT';

export type TransParams = Record<string, ReactNode | MessageDescriptor>;
export type TransComponents = Record<string, (children: ReactNode) => ReactNode>;

const DEFAULT_COMPONENTS: TransComponents = {
  b: (c) => <b>{c}</b>,
  kbd: (c) => <kbd className="od-kbd">{c}</kbd>,
  link: (c) => <>{c}</>,
};

type Node = { tag: string | null; children: (Node | string)[] };

function isDescriptor(v: unknown): v is MessageDescriptor {
  return !!v && typeof v === 'object' && 'key' in (v as object) && typeof (v as { key: unknown }).key === 'string' && !('props' in (v as object));
}

/** Lê a mensagem em uma árvore de marcas permitidas; marca desconhecida ou desbalanceada vira texto. */
export function parseMarkup(message: string, allowed: (tag: string) => boolean): Node {
  const root: Node = { tag: null, children: [] };
  const stack: Node[] = [root];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\s*(\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const top = () => stack[stack.length - 1]!;
  while ((m = re.exec(message))) {
    const [whole, closing, tag, selfClosing] = m;
    if (!allowed(tag!)) continue;
    if (m.index > last) top().children.push(message.slice(last, m.index));
    if (selfClosing && !closing) {
      top().children.push({ tag: tag!, children: [] });
    } else if (!closing) {
      const node: Node = { tag: tag!, children: [] };
      top().children.push(node);
      stack.push(node);
    } else if (stack.length > 1 && top().tag === tag) {
      stack.pop();
    } else {
      top().children.push(whole);
    }
    last = m.index + whole.length;
  }
  if (last < message.length) top().children.push(message.slice(last));
  // marcas abertas e nunca fechadas: o conteúdo continua aparecendo (sem a marca)
  return root;
}

function fillParams(text: string, params: TransParams | undefined, keyBase: string): ReactNode[] {
  if (!params || text.indexOf('{') === -1) return [text];
  const out: ReactNode[] = [];
  let i = 0;
  for (const part of text.split(/(\{[A-Za-z0-9_]+\})/g)) {
    if (!part) continue;
    const name = /^\{([A-Za-z0-9_]+)\}$/.exec(part)?.[1];
    if (name && name in params) {
      const value = params[name];
      const node = isDescriptor(value) ? translateMessage(value) : (value as ReactNode);
      out.push(typeof node === 'string' || typeof node === 'number' ? String(node) : <Fragment key={`${keyBase}-p${i++}`}>{node}</Fragment>);
    } else {
      out.push(part);
    }
  }
  return out;
}

function render(node: Node, params: TransParams | undefined, components: TransComponents, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  node.children.forEach((child, i) => {
    const key = `${keyBase}.${i}`;
    if (typeof child === 'string') {
      out.push(...fillParams(child, params, key));
      return;
    }
    const inner = render(child, params, components, key);
    const renderer = components[child.tag!] ?? DEFAULT_COMPONENTS[child.tag!];
    out.push(<Fragment key={key}>{renderer ? renderer(inner) : inner}</Fragment>);
  });
  return out;
}

export function Trans({ k, params, components }: { k: TKey; params?: TransParams; components?: TransComponents }) {
  useLocale();
  const count = params && typeof params.count === 'number' ? params.count : undefined;
  const message = rawMessage(k, count === undefined ? undefined : { count }) ?? k;
  const allComponents = { ...DEFAULT_COMPONENTS, ...(components ?? {}) };
  const tree = parseMarkup(message, (tag) => tag in allComponents);
  return <>{render(tree, params, allComponents, 'm')}</>;
}
