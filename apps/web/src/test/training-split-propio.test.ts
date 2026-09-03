import { describe, expect, it } from "vitest";

import {
  DAY_GROUPS,
  SPLIT_PRESETS,
  WEEK_DAYS,
  avisosDeVecindad,
  buildSplit,
  chocaVecindad,
  normalizeCustomSplit,
  presetSplit,
  reordenarPorVecindad,
  type SplitPresetId,
} from "@/lib/training/split";
import type { CustomSplit, DayKind } from "@/lib/training/types";

/** Los días entrenables de un split, en orden de calendario. */
function diasDe(split: CustomSplit): DayKind[] {
  return WEEK_DAYS.filter((day) => split[day] !== undefined && split[day] !== "DESCANSO").map(
    (day) => split[day] as DayKind,
  );
}

/** ¿Dos días seguidos tocan el mismo grupo muscular? */
function repiteGrupoSeguido(kinds: DayKind[]): boolean {
  return kinds.some((kind, index) => {
    if (index === 0) return false;
    return DAY_GROUPS[kind].some((grupo) => DAY_GROUPS[kinds[index - 1]!].includes(grupo));
  });
}

describe("presets de split", () => {
  it("cada preset arma 6 días entrenables", () => {
    for (const preset of SPLIT_PRESETS) {
      const kinds = diasDe(presetSplit(preset.id as SplitPresetId, 6));
      expect(kinds, preset.id).toHaveLength(6);
    }
  });

  it("ningún preset repite grupo muscular en días seguidos", () => {
    for (const preset of SPLIT_PRESETS) {
      const kinds = diasDe(presetSplit(preset.id as SplitPresetId, 6));
      expect(repiteGrupoSeguido(kinds), `${preset.id}: ${kinds.join(" → ")}`).toBe(false);
    }
  });

  it("ningún preset deja un par prohibido en días seguidos", () => {
    for (const preset of SPLIT_PRESETS) {
      const kinds = diasDe(presetSplit(preset.id as SplitPresetId, 6));
      expect(avisosDeVecindad(kinds, null), preset.id).toEqual([]);
    }
  });

  it("3 inferior / 3 superior alterna pierna y torso", () => {
    const kinds = diasDe(presetSplit("INFERIOR_SUPERIOR_3_3", 6));
    const esPierna = kinds.map((kind) => DAY_GROUPS[kind].includes("PIERNA"));
    expect(esPierna).toEqual([true, false, true, false, true, false]);
  });
});

describe("regla de vecindad", () => {
  it("hombro el día antes de pecho se estorba", () => {
    expect(chocaVecindad("HOMBRO", "PECHO_ESPALDA")).not.toBeNull();
    expect(chocaVecindad("HOMBRO", "PECHO_TRICEP")).not.toBeNull();
    expect(chocaVecindad("PECHO_ESPALDA", "HOMBRO")).toBeNull();
  });

  it("pierna pesada antes de squash o box solo estorba si se sabe qué se juega", () => {
    expect(chocaVecindad("PIERNA_CUADRICEPS", "BRAZO")).toBeNull();
    expect(chocaVecindad("PIERNA_CUADRICEPS", "BRAZO", ["SQUASH"])).not.toBeNull();
    expect(chocaVecindad("PIERNA_CUADRICEPS", "BRAZO", ["NATACION"])).toBeNull();
  });

  it("el split automático se reordena para deshacer el choque", () => {
    const original: DayKind[] = [
      "PIERNA_CUADRICEPS",
      "HOMBRO",
      "PECHO_ESPALDA",
      "PIERNA_FEMORAL",
      "BRAZO",
      "PIERNA_GLUTEO",
    ];
    const reordenado = reordenarPorVecindad(original);

    expect(avisosDeVecindad(reordenado, null)).toEqual([]);
    // Reordena: no cambia qué se entrena en la semana.
    expect([...reordenado].sort()).toEqual([...original].sort());
  });

  it("el split que arma el motor ya no deja hombro antes de pecho", () => {
    for (const dias of [4, 5, 6, 7]) {
      const { kinds, avisos } = buildSplit({ liftingDays: dias, conditions: [] });
      expect(avisos, `${dias} días: ${kinds.join(" → ")}`).toEqual([]);
    }
  });
});

describe("split propio", () => {
  const propio: CustomSplit = {
    LUN: "PIERNA_CUADRICEPS",
    MAR: "HOMBRO",
    MIE: "PECHO_ESPALDA",
    JUE: "DESCANSO",
    VIE: "BRAZO",
  };

  it("manda sobre el número de días: lo que no está listado es descanso", () => {
    const { kinds, days } = buildSplit({ liftingDays: 6, conditions: [], customSplit: propio });
    expect(kinds).toEqual(["PIERNA_CUADRICEPS", "HOMBRO", "PECHO_ESPALDA", "BRAZO"]);
    expect(days).toEqual(["LUN", "MAR", "MIE", "VIE"]);
  });

  it("no se reordena: se avisa, con el día por nombre y qué hacer", () => {
    const { kinds, avisos } = buildSplit({ liftingDays: 6, conditions: [], customSplit: propio });

    // El orden que ella escribió se respeta tal cual.
    expect(kinds[1]).toBe("HOMBRO");
    expect(kinds[2]).toBe("PECHO_ESPALDA");
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("martes");
    expect(avisos[0]).toContain("miércoles");
    expect(avisos[0]).toContain("Cambiar");
  });

  it("sin split propio los días los sigue eligiendo el horario", () => {
    expect(buildSplit({ liftingDays: 5, conditions: [] }).days).toBeNull();
  });

  it("un JSON corrupto no deja a nadie sin split", () => {
    expect(normalizeCustomSplit({ LUN: "NO_EXISTE", XXX: "HOMBRO" })).toBeNull();
    expect(normalizeCustomSplit(null)).toBeNull();
    expect(normalizeCustomSplit(["LUN"])).toBeNull();
    expect(normalizeCustomSplit({ LUN: "HOMBRO", MAR: 7, MIE: "DESCANSO" })).toEqual({
      LUN: "HOMBRO",
      MIE: "DESCANSO",
    });
  });
});
