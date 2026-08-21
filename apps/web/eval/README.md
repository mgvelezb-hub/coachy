# Evaluación de Coachy

`pnpm -F web eval:coachy` corre el pipeline de Coachy sobre las **19 semanas reales** del
historial que ya usa el backtest del motor (`packages/engine/data/coach-history.json`, solo
señales abstractas) con un **perfil sintético**, y escribe un archivo por semana en esta carpeta.

```bash
pnpm -F web eval:coachy
```

Necesita `ANTHROPIC_API_KEY` en `apps/web/.env.local` o exportada en la shell. Sin ella el script
se detiene con un mensaje que dice qué falta — no con un stack trace.

Cuesta 19 llamadas a la API (una por semana). No corre visión: sin fotos reales, inventar un
`photosTrend` contaminaría la decisión del motor.

## Qué genera

| Archivo | Qué trae |
|---|---|
| `YYYY-MM-DD.md` | Decisión real del coach vs. decisión del motor, reglas disparadas, preguntas elegidas, la respuesta de Coachy en texto y en campos, y la rúbrica para palomear |
| `summary.json` | Categoría, fase y kcal de cada semana |

**Las salidas están ignoradas por git** (`apps/web/eval/*`, salvo este README): son texto generado
sobre un atleta y este repo es público.

## Rúbrica

Seis criterios, uno por cada paso de la metodología del coach. Una semana pasa si cumple los seis.

| # | Criterio | Pasa cuando… | Falla cuando… |
|---|---|---|---|
| 1 | **Celebra** | Nombra algo concreto y verificable de la semana: un centímetro, una carga, el cumplimiento, una zona de las fotos | Halaga en genérico ("vas muy bien") o celebra algo que no está en los datos |
| 2 | **Pregunta** | Hace entre 1 y 3 preguntas, y son las que el banco eligió para esa señal | Hace 0 preguntas habiéndolas, hace más de 3, o pregunta algo que ya contestó el formulario |
| 3 | **Compara** | Contrasta contra la semana anterior (y contra el día 1 si hay fotos) con números que existen | Inventa una comparación, o compara contra algo que no está en el contexto |
| 4 | **Decide** | Dice qué pasa con la dieta y, si cita números, son **exactamente** los del motor | Inventa kcal o gramos, propone un cambio que el motor no decidió, o contradice la fase |
| 5 | **Meta** | Deja una meta corta, de 7 días y medible | Sin meta, o una meta vaga ("échale ganas") |
| 6 | **Tono** | Hype corto, frases cortas, vocabulario del atleta, cero regaño, cero lenguaje clínico | Regaña por el cumplimiento, suena a nutriólogo, interpreta síntomas o estudios, o se alarga |

### Cómo revisar

1. Abre las semanas en orden: el hilo importa tanto como cada mensaje suelto.
2. Palomea la rúbrica dentro de cada archivo.
3. Presta atención especial a las semanas donde el motor y el coach real **no** coincidieron
   (aparecen en la cabecera del archivo): ahí es donde el tono tiene que sostener una decisión
   distinta a la que el atleta esperaba.
4. Lo que no te guste, reescríbelo. Ese texto reescrito es exactamente lo que la cola de
   `/admin/decisiones` guarda como `training_examples` y reinyecta como few-shot.

### Criterios de aceptación sugeridos

- 6/6 en al menos 15 de las 19 semanas.
- **Cero** violaciones del criterio 4 (números inventados). Una sola es motivo de arreglo, no de
  promedio: el guardrail `enforceEngineNumbers` debería haberla atrapado antes.
- Cero regaños y cero interpretaciones médicas en las 19.
