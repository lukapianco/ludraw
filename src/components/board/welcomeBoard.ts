/**
 * LuDraw — Board de boas-vindas ("Comece por aqui").
 * O conteúdo foi movido para `src/utils/welcome.ts` no Chat 03 (pré-tarefa 1) para que o
 * store crie o board inicial sem depender de `components/`. Este arquivo só reexporta,
 * mantendo os imports antigos (`dashboard/templates.ts`) funcionando.
 */

export { welcomeBoardName, createWelcomeElements, createWelcomeBoardData } from '../../utils/welcome';
