# Backtest del motor — calibración y resultado

Objetivo del plan (0.7): reproducir la decisión del coach real en **≥ 80 %** de las 19 semanas
del historial ene–jun 2026, comparando la **categoría** de la decisión y contando
`MENU_REFRESH` como `HOLD` de fase.

Ejecutar: `pnpm -F engine backtest` (falla con exit 1 si baja de 80 %).

## Resultado

**19/19 = 100.0 %** de coincidencia de categoría.

De esas 19, seis son cambios reales (`TIGHTEN`, `CUT`, `CUT_AGRESIVO`, `REFEED` ×2,
`CONTEXT_CHANGE`) y trece son `HOLD` de fase. El motor no produce ningún cambio falso en las
semanas que el coach mantuvo, ni omite ninguno de los seis cambios.

```
semana      esperado        motor           ok  fase            kcal   reglas
------------------------------------------------------------------------------------------------
2026-01-24  HOLD            HOLD            OK  BASE            1760   R3
2026-01-31  MENU_REFRESH    HOLD            OK  BASE            1760   R8
2026-02-07  HOLD            MENU_REFRESH    OK  BASE            1760   R8,R13
2026-02-14  MENU_REFRESH    HOLD            OK  BASE            1760   R3,R8
2026-02-22  HOLD            MENU_REFRESH    OK  BASE            1760   R13
2026-03-01  MENU_REFRESH    HOLD            OK  BASE            1760   R8
2026-03-09  HOLD            MENU_REFRESH    OK  BASE            1760   R8,R13
2026-03-15  TIGHTEN         TIGHTEN         OK  BASE            1660   R11
2026-03-21  HOLD            HOLD            OK  BASE            1660   R14
2026-03-28  REFEED          REFEED          OK  REFEED          1760   R10
2026-04-11  CUT             CUT             OK  CUT             1640   R12
2026-04-18  HOLD            HOLD            OK  CUT             1640   R8
2026-04-25  HOLD            MENU_REFRESH    OK  CUT             1640   R8,R13
2026-05-02  HOLD            HOLD            OK  CUT             1640   R8
2026-05-06  CUT_AGRESIVO    CUT_AGRESIVO    OK  CUT_AGRESIVO    1540   R11
2026-05-09  HOLD            HOLD            OK  CUT_AGRESIVO    1540   R8
2026-05-17  REFEED          REFEED          OK  REFEED          1760   R12
2026-05-31  HOLD            MENU_REFRESH    OK  ESTABILIZACION  1760   R8,R12,R13
2026-06-05  CONTEXT_CHANGE  CONTEXT_CHANGE  OK  ESTABILIZACION  1760   R0,R12
------------------------------------------------------------------------------------------------
Coincidencia: 19/19 = 100.0%  (meta >= 80%)
```

## Fixtures

`data/coach-history.json`. Repo público ⇒ **cero datos personales**: solo `week`, medidas cuando el
chat las tiene (`waistCm`, `weightKg`), escalas 1–5 de sensación, tendencia de fuerza, `compliance`,
lista de síntomas categóricos, banderas de contexto y la categoría esperada. Sin nombres, sin texto
de mensajes, sin fotos. Un test (`backtest.test.ts`) verifica que no aparezca ninguna clave fuera
de la lista permitida.

Donde el chat no da medidas, `waistCm` va ausente y la señal se expresa con las escalas
(`inflammation`, `energy`, `hunger`, `sleep`) y con `photosTrend`, que es lo que el coach usaba
esas semanas ("te veo más desinflamada", "igual").

## Ajustes de configuración

El plan permite ajustar **config**, no inventar reglas. Estos son todos los defaults que se movieron
respecto al texto literal de `02-motor-dietas-spec.md`, con su razón.

| Parámetro | Spec | Default calibrado | Por qué |
|---|---|---|---|
| `pal.perStrengthDay` | 0.075 | **0.06** | Con los coeficientes del spec, el caso de calibración del plan (75 kg, 1.62 m, 4 días de pesas, 105 min de cardio) da PAL 1.66 y TDEE **2,420** kcal. El plan pide TDEE ≈ **2,190** (PAL ≈ 1.5). Con 0.06 / 0.0006 el caso da PAL 1.503 y TDEE 2,197 (+0.3 %). 1.5 es además más plausible para un trabajo sedentario. |
| `pal.perCardioMin` | 0.0015 | **0.0006** | Igual que arriba. |
| `proteinMinGPerKgBodyweight` | 1.6 (piso del clamp) | **1.73** | El coach prescribía ~130 g a 75 kg = 1.73 g/kg en todas las fases. Con el piso en 1.6 el caso de calibración da 120 g y el plan pide ≈130 g (±3 %). El **piso duro de seguridad sigue en 1.6 g/kg** (`proteinSafetyFloorGPerKgBodyweight`), verificado por test. |
| `fatMinGPerKg` | 0.5 | **0.53** | El plan pide grasa ≈ 40 g para 75 kg; 0.5 g/kg da 37.5 g (−6 %). 0.53 g/kg da 39.75 → 40 g. Sigue por encima del piso hormonal de 0.5 del spec. |
| `deficits.CUT` | [0.25, 0.30] | **[0.25, 0.28]** | Sin esto, el escalón de −100 kcal desde el arranque de `CUT` sigue cayendo dentro de la banda y el motor devuelve `TIGHTEN` donde el coach pasó a corte agresivo (semana 2026‑05‑06). Estrechar la banda hace que el escalón salga del rango y active el protocolo `CUT_AGRESIVO`, que trae electrolitos obligatorios y tope duro de semanas. |
| `maxWeeks.CUT_AGRESIVO` | 3 (spec: "máx 2–3") | **2** | El coach corrió corte agresivo ~11 días (06/05 → 17/05) y ahí forzó la recarga. Con tope 2 el motor dispara `REFEED` en la misma semana que él. |
| `maxWeeks.ESTABILIZACION` | 2 (spec: "1–2") | **1** | El bloque real de reseteo fue de 2 semanas (choque + estabilización) y a la tercera ya había plan nuevo. Con tope 1 el motor sale de estabilización a `CUT` en 2026‑04‑11, igual que él. |
| `kcalAdjustStep` | 125 (spec: "−100 a −150") | **100** | Extremo suave del rango del spec. Con 125 o 150 el primer apretón de marzo se sale de la banda de `BASE` y el motor devuelve `CUT` donde el coach solo apretó calorías dentro de la misma fase. |
| `daysWithoutTrainingForMaintenance` | 7 | **10** | Con 7, la semana 2026‑05‑17 ("sin gym una semana") mandaba a `MANTENIMIENTO`; el coach subió carbos para no estancarse. Una semana suelta no es una pausa de entrenamiento. |
| `symptomCountForRefeed` | — (spec lista 4 síntomas sin decir cuántos) | **2** | Con 1 síntoma bastando, cualquier semana con inflamación alta iba a `REFEED`. Exigir 2 de 4 (inflamación ≥4, energía ≤2, hambre ≥4, sueño ≤2) separa "apretar" de "recargar", que es la distinción que hacía el coach. |
| `allowSubjectiveProgress` | — | **true** | `03-metodologia-coach.md` §4 pone la jerarquía cinta > fotos > sensación > fuerza. Cuando una semana no trae ninguna medida objetiva, el motor acepta "desinflamada + fuerza sube" como progreso. Sin esto, abril entero (tres `HOLD` del coach sin medidas) se leía como estancamiento. |

Ningún ajuste toca las reglas: son todos valores de `DEFAULT_CONFIG`, editables desde
`loadConfig()` y desde el editor de config del admin.

## Desviaciones de diseño respecto al spec

1. **Orden de `SEGURIDAD_RITMO_RAPIDO` (`R6`).** El spec la pone en el bloque 6 (topes), después de
   PROGRESO. Ahí es inalcanzable: bajar >1 %/semana *es* progreso, así que `R8` dispara antes y la
   regla nunca corre. Se movió al bloque de seguridad, que es donde pertenece por intención
   (proteger masa magra).
2. **`R12 TOPE_DE_FASE` delega en la máquina de fases.** El spec §4.6 dice "tope → REFEED forzado",
   pero la tabla §3 define salidas distintas por fase (`REFEED → ESTABILIZACION`,
   `ESTABILIZACION → BASE|CUT`). Se respeta la tabla.
3. **`REFEED → ESTABILIZACION` es automática**, no una decisión: el spec dice "siempre". El motor la
   aplica al construir el contexto de la semana, sin emitir una categoría propia.
4. **Escalera de bandas.** "Profundizar (pasar a siguiente fase si toca)" se implementa así: se
   aplica el escalón de kcal; si el déficit resultante sigue dentro de la banda de la fase, es
   `TIGHTEN`; si se sale, avanza a la siguiente fase y el déficit se recorta a la banda nueva.
