# Paquete de validación con expertos (Fase 5)

Este directorio recibe `perfil-a.md`, `perfil-b.md` y `perfil-c.md`, generados
localmente por:

```
cd apps/web && npx tsx scripts/paquete-validacion.ts
```

**Los `.md`/`.pdf` de los perfiles NUNCA se suben al repo** (están en
`.gitignore`): contienen menús y rutinas completos que, aunque los perfiles
están anonimizados ("Perfil A/B/C"), son datos de personas reales (Mau e
Irma) o construidos a partir de ellos. Solo el script que los genera y este
README se versionan.

Conversión a PDF: no hay `pandoc` ni `md-to-pdf` instalados en esta máquina
al momento de escribir esto. El paquete se manda en `.md` — cualquier editor
de Markdown (VS Code, Obsidian, GitHub) lo renderiza bien, y las casillas
`- [ ]` funcionan igual. Si se instala `pandoc` después:

```
pandoc validacion/perfil-a.md -o validacion/perfil-a.pdf
```

## A quién se manda y cómo

- **Nutrición** (Perfiles A y C, y la parte de nutrición del B): a Gisa o a
  Mariana, por WhatsApp o correo, con el `.md` (o `.pdf` si ya hay
  herramienta) adjunto. Pedir que llenen las casillas "esto debe ser regla"
  y regresen el archivo.
- **Rutina** (los tres perfiles): a Ian, mismo canal.
- Ninguno de los tres necesita ver los otros perfiles ni saber que son de
  Mau/Irma — por eso están anonimizados. Si preguntan, se puede decir que son
  "perfiles de prueba representativos".

## De la respuesta al golden test

Cada respuesta con la casilla marcada se convierte en **una aserción de un
golden test**, no en un test nuevo por respuesta. La regla general:

1. Si la regla es de **composición del platillo o de menú** (nutrición) →
   `packages/engine/test/golden/menus.test.ts`, dentro del `describe.each`
   existente. Se añade un nuevo `it(...)` con el nombre del experto en el
   comentario, o se extiende uno de los ya existentes
   (`ninguna comida rompe la composicion`, etc.) si la regla encaja ahí.
2. Si la regla es de **reparto de macros o de fases** (deficit, proteína,
   etc.) → `packages/engine/test/menu.test.ts` o un archivo nuevo
   `packages/engine/test/reglas-expertos.test.ts` si no hay dónde encajarla.
3. Si la regla es de **rutina** (vecindad, volumen, progresión) →
   `apps/web/src/test/training-generate.test.ts`, mismo patrón: nuevo `it`
   con el nombre del coach en el comentario.

Una regla que el motor **no puede expresar todavía** (por ejemplo, "nunca
combines X con Y" si X y Y no están en `afinidad.incompatibles`) no se
inventa en el test: se anota en `packages/engine/BACKTEST.md` o se reporta al
agente de F1b que sigue afinando `packages/engine/src/menu.ts`, y el test se
escribe hasta que el motor tenga con qué cumplirlo.

### Plantilla de golden test (nutrición)

```ts
// Regla de <nombre del experto>, paquete de validación F5, Perfil <A|B|C>:
// <pega aquí la pregunta y la respuesta textual>
it('<nombre del experto>: <resumen de la regla en una línea>', () => {
  for (const dia of DIAS) {
    for (const meal of comidasDe(caso, dia)) {
      // ... aserción concreta sobre meal.items / meal.totals
    }
  }
});
```

### Plantilla de golden test (rutina)

```ts
// Regla de <nombre del coach>, paquete de validación F5, Perfil <A|B|C>:
// <pega aquí la pregunta y la respuesta textual>
it('<nombre del coach>: <resumen de la regla en una línea>', () => {
  const week = generate(profile({ /* ... */ }));
  // ... aserción concreta sobre week.workouts
});
```

## Qué trae cada documento

1. Ficha del perfil, sin nombre, con la fuente de los datos (golden del
   motor, seed real o supuesto del brief — cada documento lo dice).
2. Macros diarios y el porqué (fase, presupuesto).
3. Tres días de menú en medidas caseras, con kcal y macros por comida.
4. Las reglas de composición del platillo, en prosa (leídas de
   `DEFAULT_CONFIG`, sin tocar el motor).
5. Dos semanas de rutina: split, ejercicios, series×reps, esquema y minutos
   estimados por sesión.
6. El cuestionario cerrado (ver más abajo), con espacio de respuesta y una
   casilla "esto debe ser regla" por pregunta.

## Cuestionario cerrado (el mismo en los tres documentos)

**Nutrición**
- ¿Alguna porción que nunca mandarías? ¿Cuál y por qué?
- ¿Combinación que no va?
- ¿Orden y horarios de comidas razonables para este perfil?
- ¿Qué cambiarías del reparto de macros?

**Rutina**
- ¿Vecindad de grupos correcta?
- ¿Volumen por sesión?
- ¿Progresión razonable en 4 semanas?
- ¿Algo que un coach real haría distinto?
