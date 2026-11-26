/**
 * LuDraw — `Path2D` com origem rastreável (Chat 05).
 *
 * Os desenhos de exportação (`utils/export.ts`, `drawMindMapToCanvas`…) criam `Path2D` a partir de
 * strings SVG. Guardar a string de origem permite que o contexto de gravação SVG
 * (`utils/svgContext.ts`) reaproveite EXATAMENTE o mesmo código de desenho para gerar SVG
 * vetorial — sem recalcular geometria.
 */

const SOURCES = new WeakMap<object, string>();

/** `new Path2D(d)` + registro da string de origem. */
export function pathFromSvg(d: string): Path2D {
  const p = typeof Path2D !== 'undefined' ? new Path2D(d) : ({} as Path2D);
  SOURCES.set(p, d);
  return p;
}

/** String SVG de um `Path2D` criado por `pathFromSvg` (ou `undefined`). */
export function svgSourceOf(path: Path2D): string | undefined {
  return SOURCES.get(path);
}
