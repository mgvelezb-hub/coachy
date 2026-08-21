"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { macrosFor } from "engine";

import { requireAdmin } from "@/lib/auth";
import { publishNotification } from "@/lib/coachy";
import { toEngineProfile } from "@/lib/coachy/mapping";
import type { CoachyReply } from "@/lib/coachy/types";
import { decimalToNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import type { Phase } from "@/lib/engine-types";

/**
 * Validación humana de las decisiones (spec 03 §2.2.6).
 *
 * Aprobar es un tap. Corregir edita fase, kcal y texto — y esa corrección es
 * justo lo que hace que Coachy aprenda: se guarda como `TrainingExample` con
 * fuente `ADMIN` y vuelve al prompt como few-shot la semana siguiente.
 *
 * Solo se guardan las **correcciones**, no las aprobaciones: reinyectar texto
 * que el propio modelo escribió sería entrenarlo con su propio eco.
 */

export type DecisionState = {
  status: "idle" | "error" | "success";
  message: string | null;
};

export const EMPTY_DECISION_STATE: DecisionState = { status: "idle", message: null };

const PHASES: readonly Phase[] = [
  "REINTRO",
  "BASE",
  "CUT",
  "CUT_AGRESIVO",
  "REFEED",
  "ESTABILIZACION",
  "MANTENIMIENTO",
];

function replyFrom(value: Prisma.JsonValue | null): CoachyReply | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as unknown as CoachyReply;
}

/** Quita el nombre del atleta del texto antes de guardarlo como ejemplo. */
function anonymize(text: string, displayName: string): string {
  const first = displayName.trim().split(/\s+/)[0];
  if (!first || first.length < 3) return text;
  return text.replaceAll(new RegExp(first, "gi"), "{{ATLETA}}");
}

async function loadDecision(decisionId: string) {
  return prisma.decision.findUnique({
    where: { id: decisionId },
    include: { checkIn: true, user: { include: { profile: true } } },
  });
}

export async function approveDecision(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  await requireAdmin();

  const decisionId = String(formData.get("decisionId") ?? "");
  const decision = await loadDecision(decisionId);
  if (!decision) return { status: "error", message: "Esa decisión ya no existe." };

  const now = new Date();
  await prisma.decision.update({
    where: { id: decision.id },
    data: { status: "APROBADA", approvedAt: now, publishedAt: now },
  });

  const reply = replyFrom(decision.replyJson);
  if (reply) await publishNotification(decision.userId, decision.user.email, reply);

  revalidatePath("/admin/decisiones");
  revalidatePath("/app", "layout");

  return { status: "success", message: "Aprobada y publicada." };
}

export async function correctDecision(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const admin = await requireAdmin();

  const decisionId = String(formData.get("decisionId") ?? "");
  const decision = await loadDecision(decisionId);
  if (!decision) return { status: "error", message: "Esa decisión ya no existe." };

  const profile = decision.user.profile;
  if (!profile) return { status: "error", message: "El atleta no tiene perfil." };

  const phaseRaw = String(formData.get("phase") ?? "");
  const phase = PHASES.includes(phaseRaw as Phase) ? (phaseRaw as Phase) : decision.phase;
  const kcal = Number(formData.get("kcal"));
  const text = String(formData.get("text") ?? "").trim();

  if (!Number.isFinite(kcal) || kcal < 800 || kcal > 6000) {
    return { status: "error", message: "Las kcal tienen que estar entre 800 y 6000." };
  }
  if (text.length < 20) {
    return { status: "error", message: "El texto es demasiado corto para publicarlo." };
  }

  // Los macros se recalculan con el motor: si el admin mueve kcal, proteína y
  // grasa siguen respetando los pisos del motor en lugar de quedar a mano.
  let targets;
  try {
    const engineProfile = toEngineProfile(profile, decimalToNumber(decision.checkIn.weightKg));
    targets = macrosFor(phase, engineProfile, kcal);
  } catch (error) {
    return { status: "error", message: `El motor rechazó esos números: ${String(error)}` };
  }

  const original = replyFrom(decision.replyJson);

  // El admin escribe el mensaje completo, no seis campos. Se guarda entero en
  // `celebracion` porque `replyToText` ignora los campos vacíos y lo publica tal
  // cual; las preguntas de la semana se conservan para no perder el hilo.
  const corrected: CoachyReply = {
    celebracion: text,
    preguntas: original?.preguntas ?? [],
    comparacion: "",
    decision_texto: "",
    meta: "",
    cierre: "",
  };

  const now = new Date();

  await prisma.decision.update({
    where: { id: decision.id },
    data: {
      phase,
      kcal: targets.kcal,
      proteinG: targets.proteinG,
      fatG: targets.fatG,
      carbsG: targets.carbG,
      fiberG: targets.fiberG,
      status: "CORREGIDA",
      correctedById: admin.id,
      correctedJson: {
        phase,
        kcal: targets.kcal,
        text,
        original: (decision.replyJson ?? null) as Prisma.InputJsonValue,
      } as Prisma.InputJsonValue,
      replyJson: corrected as unknown as Prisma.InputJsonValue,
      approvedAt: now,
      publishedAt: now,
    },
  });

  await prisma.conversation.create({
    data: {
      userId: decision.userId,
      role: "COACHY",
      text,
      contextJson: { decisionId: decision.id, corregidaPor: admin.id } as Prisma.InputJsonValue,
    },
  });

  // El loop de corrección: este par entra al banco de few-shot.
  await prisma.trainingExample.create({
    data: {
      userId: decision.userId,
      source: "ADMIN",
      contextJson: {
        fase: phase,
        reglas: (decision.rules as Prisma.InputJsonValue) ?? [],
        kcal: targets.kcal,
        propuesta_original: (decision.replyJson ?? null) as Prisma.InputJsonValue,
      } as Prisma.InputJsonValue,
      approvedResponse: anonymize(text, profile.displayName),
    },
  });

  await publishNotification(decision.userId, decision.user.email, corrected);

  revalidatePath("/admin/decisiones");
  revalidatePath("/app", "layout");

  return { status: "success", message: "Corregida, publicada y guardada como ejemplo." };
}
