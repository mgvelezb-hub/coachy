import { useRouter } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/Card";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { SectionLabel } from "@/components/SectionLabel";
import {
  ApiError,
  GOAL_VIEWS,
  GOAL_VIEW_LABEL,
  deleteGoalReference,
  getGoal,
  goalPhotoPath,
  postGoalReference,
  type GoalReferenceUrl,
  type GoalResponse,
  type GoalView,
} from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { fonts, radius, spacing, type Palette } from "@/lib/theme";
import { useSession } from "@/context/session";
import { useTheme } from "@/context/theme";

/**
 * "Rumbo a tu objetivo" — pantalla empujada (fuera de tabs), espejo de
 * `/app/objetivo` en la web (apps/web/src/app/app/objetivo/page.tsx).
 *
 * Las 3 fotos de referencia se suben DIRECTO a Storage con la sesión de la
 * atleta (misma RLS que ya protege `progress-photos/{userId}/goal/*`); el
 * backend solo confirma que el objeto quedó ahí. El análisis por zona no se
 * arma aquí: `GET /api/v1/goal` ya lo manda como `lines: string[]` listo
 * para pintar, calculado del lado del servidor.
 */

/** Mismo bucket que `PHOTO_BUCKET` en apps/web/src/lib/env.ts. */
const GOAL_PHOTO_BUCKET = "progress-photos";

/** Texto de `GOAL_FRAMING` en apps/web/src/lib/coachy/goal.ts — es copia de
 * producto, no viene de la API porque ese módulo es server-only. */
const GOAL_FRAMING = [
  "La referencia es dirección, no promesa. Sirve para saber hacia dónde empujar, no para prometerte un resultado.",
  "Se comparan proporciones y hábitos, no identidades. Nunca vas a leer aquí qué tan parecida eres a alguien.",
  "Tu estructura ósea y tu distribución de grasa son tuyas y no se negocian. Dos cuerpos con el mismo entrenamiento y la misma comida llegan a siluetas distintas, y las dos están bien.",
];

function formatAnalyzedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "long" });
}

export default function ObjetivoScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const userId = session?.user.id ?? null;

  const [data, setData] = useState<GoalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyView, setBusyView] = useState<GoalView | null>(null);

  const load = useCallback(async () => {
    try {
      const goal = await getGoal();
      setData(goal);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar tu objetivo");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUpload(view: GoalView) {
    if (!userId || busyView) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Falta permiso",
        "Necesitas dar acceso a tus fotos para subir una referencia.",
      );
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
    });
    if (picked.canceled || picked.assets.length === 0) return;

    setBusyView(view);
    try {
      const asset = picked.assets[0]!;
      const arrayBuffer = await fetch(asset.uri).then((response) => response.arrayBuffer());
      const path = goalPhotoPath(userId, view);

      const { error: uploadError } = await supabase.storage
        .from(GOAL_PHOTO_BUCKET)
        .upload(path, arrayBuffer, { upsert: true, contentType: "image/jpeg" });
      if (uploadError) throw uploadError;

      await postGoalReference(view);
      await load();
    } catch (e) {
      Alert.alert(
        "No se pudo subir la foto",
        e instanceof ApiError ? e.message : "Revisa tu conexión e intenta otra vez.",
      );
    } finally {
      setBusyView(null);
    }
  }

  function handleDelete(view: GoalView) {
    Alert.alert(
      `Quitar referencia de ${GOAL_VIEW_LABEL[view].toLowerCase()}`,
      "Se borra de tu objetivo. Puedes volver a subir otra cuando quieras.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Quitar",
          style: "destructive",
          onPress: async () => {
            setBusyView(view);
            try {
              await deleteGoalReference(view);
              await load();
            } catch (e) {
              Alert.alert(
                "No se pudo quitar",
                e instanceof ApiError ? e.message : "Revisa tu conexión e intenta otra vez.",
              );
            } finally {
              setBusyView(null);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.backRow} hitSlop={8}>
          <Text style={styles.backText}>← Atrás</Text>
        </Pressable>

        <Text style={styles.title}>Tu objetivo</Text>
        <Text style={styles.subtitle}>
          Hasta tres fotos del físico al que le apuntas: frente, perfil y espalda.
        </Text>

        <Card>
          <SectionLabel>Qué es y qué no es esta referencia</SectionLabel>
          <View style={styles.framingList}>
            {GOAL_FRAMING.map((line) => (
              <Text key={line} style={styles.framingLine}>
                {line}
              </Text>
            ))}
          </View>
        </Card>

        {!data && !error ? <LoadingState label="Cargando tu objetivo..." /> : null}
        {!data && error ? <ErrorState message={error} onRetry={load} /> : null}

        {data && (
          <>
            <Card>
              <View style={styles.slots}>
                {GOAL_VIEWS.map((view) => (
                  <Slot
                    key={view}
                    view={view}
                    reference={data.references.find((r) => r.view === view) ?? null}
                    busy={busyView === view}
                    disabled={busyView !== null && busyView !== view}
                    onUpload={() => handleUpload(view)}
                    onDelete={() => handleDelete(view)}
                  />
                ))}
              </View>
            </Card>

            <StatusCard status={data.status} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Slot({
  view,
  reference,
  busy,
  disabled,
  onUpload,
  onDelete,
}: {
  view: GoalView;
  reference: GoalReferenceUrl | null;
  busy: boolean;
  disabled: boolean;
  onUpload: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.slot}>
      <Text style={styles.slotLabel}>{GOAL_VIEW_LABEL[view]}</Text>

      <Pressable
        onPress={onUpload}
        disabled={busy || disabled}
        style={[styles.slotBox, reference && styles.slotBoxFilled]}
      >
        {busy ? (
          <ActivityIndicator color={colors.paloRosa} />
        ) : reference ? (
          <Image source={{ uri: reference.url }} style={styles.slotImage} contentFit="cover" />
        ) : (
          <Text style={styles.slotEmptyText}>Elegir{"\n"}foto</Text>
        )}
      </Pressable>

      {reference ? (
        <Pressable onPress={onDelete} disabled={busy || disabled} hitSlop={8}>
          <Text style={styles.slotDelete}>Quitar</Text>
        </Pressable>
      ) : (
        <Pressable onPress={onUpload} disabled={busy || disabled} hitSlop={8}>
          <Text style={styles.slotDelete}>Subir</Text>
        </Pressable>
      )}
    </View>
  );
}

function StatusCard({ status }: { status: GoalResponse["status"] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (status.state === "sin_referencia") {
    return (
      <Card>
        <SectionLabel>Tu rumbo</SectionLabel>
        <EmptyState message="Estas tres fotos son a dónde vas, no un examen de cómo te ves hoy. Súbelas para empezar a comparar tu rumbo." />
      </Card>
    );
  }

  if (status.state === "sin_fotos") {
    return (
      <Card>
        <SectionLabel>Tu rumbo</SectionLabel>
        <EmptyState message="Ya tienes tu referencia guardada. En cuanto tu historial tenga fotos de progreso, aquí aparece la comparación." />
      </Card>
    );
  }

  if (status.state === "en_espera") {
    return (
      <Card>
        <SectionLabel>Tu rumbo</SectionLabel>
        <EmptyState message="El análisis se hace cada 2 semanas. Todavía no hay uno disponible — vuelve en unos días." />
      </Card>
    );
  }

  return (
    <Card>
      <View style={styles.statusHeader}>
        <SectionLabel color={colors.champan}>Tu rumbo</SectionLabel>
        <Text style={styles.statusDate}>Última revisión: {formatAnalyzedAt(status.analyzedAt)}</Text>
      </View>
      <View style={styles.statusLines}>
        {status.lines.map((line) => (
          <Text key={line} style={styles.statusLine}>
            {line}
          </Text>
        ))}
      </View>
    </Card>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.obsidiana,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.huge,
  },
  backRow: { flexDirection: "row", alignItems: "center" },
  backText: { fontFamily: fonts.sans, fontSize: 13, color: colors.paloRosaLight },
  title: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.marfil,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.paloRosaLight,
    marginTop: -spacing.sm,
  },
  framingList: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  framingLine: {
    fontFamily: fonts.serifItalic,
    fontSize: 15,
    lineHeight: 21,
    color: colors.paloRosaLight,
  },
  slots: {
    flexDirection: "row",
    gap: spacing.md,
  },
  slot: {
    flex: 1,
    gap: spacing.xs,
    alignItems: "center",
  },
  slotLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.marfil,
  },
  slotBox: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  slotBoxFilled: {
    borderStyle: "solid",
    borderColor: colors.guindaLight,
  },
  slotImage: {
    width: "100%",
    height: "100%",
  },
  slotEmptyText: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.paloRosaLight,
    textAlign: "center",
  },
  slotDelete: {
    fontFamily: fonts.display,
    fontSize: 9,
    letterSpacing: 1.5,
    color: colors.paloRosa,
  },
  statusHeader: {
    gap: 2,
  },
  statusDate: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.paloRosaLight,
  },
  statusLines: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  statusLine: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.marfil,
  },
});
