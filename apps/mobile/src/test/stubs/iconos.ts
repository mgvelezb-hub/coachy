/**
 * Stub de `lucide-react-native` para las pruebas de lógica pura.
 *
 * `lib/disciplinas.tsx` mapea disciplinas a componentes; para verificar ese
 * mapa no hace falta renderizar un SVG, solo distinguir un componente de otro.
 * Por eso cada export es una función propia: la prueba de "ninguna disciplina
 * comparte ícono" compara identidades.
 *
 * Solo están los nombres que el módulo de disciplinas usa. Si mañana entra
 * otro ícono al mapa y falta aquí, la prueba falla señalándolo — que es
 * preferible a un `Proxy` que devuelve algo para cualquier nombre y deja pasar
 * un ícono mal escrito.
 */
export const Activity = () => null;
export const Dumbbell = () => null;
export const Waves = () => null;
