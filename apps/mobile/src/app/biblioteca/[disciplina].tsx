import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { InfoTip, TextoInfo } from "@/components/InfoTip";
import { ScoreCard } from "@/components/ScoreCard";
import { SectionLabel } from "@/components/SectionLabel";
import { ErrorState } from "@/components/States";
import { useTheme } from "@/context/theme";
import { DISCIPLINE_LABELS, type Discipline } from "@/lib/api";
import { iconoDe } from "@/lib/disciplinas";
import {
  BIBLIOTECA_POR_DISCIPLINA,
  NIVEL_LABEL,
  ORDEN_NIVEL,
  porCategoria,
  type EjercicioDisciplina,
} from "@/lib/tecnica";
import { fonts, radius, spacing, type as typeScale, type Palette } from "@/lib/theme";

/**
 * La hoja de una disciplina dentro de Biblioteca: sus movimientos agrupados
 * por categoría (técnica, levantamiento, golpeo...), cada una con su propia
 * hoja de detalle.
 *
 * Antes era una torre de acordeones —nivel → categoría → ejercicio, tres
 * niveles abriendo hacia abajo. La LEY DE DISEÑO lo prohíbe: aquí la lista de
 * categorías ya no se despliega, cada una hace zoom a su propia hoja (un
 * `Modal` de pantalla completa) con los ejercicios agrupados por nivel y su
 * ficha en un InfoTip en vez de texto suelto.
 */
export default function BibliotecaDisciplinaScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { disciplina } = useLocalSearchParams<{ disciplina: string }>();
  const [categoriaAbierta, setCategoriaAbierta] = useState<string | null>(null);

  const ejercicios = BIBLIOTECA_POR_DISCIPLINA[disciplina as Discipline] ?? [];

  if (ejercicios.length === 0) {
    return <ErrorState message="Esa disciplina no existe." onRetry={() => router.back()} />;
  }

  const Icono = iconoDe(disciplina as Discipline);
  const categorias = porCategoria(ejercicios);
  const categoriaActual = categorias.find((c) => c.categoria === categoriaAbierta) ?? null;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <ChevronLeft size={22} color={colors.paloRosa} strokeWidth={2} />
          <Text style={styles.backText}>Atrás</Text>
        </Pressable>

        <View style={styles.header}>
          <Icono size={28} color={colors.paloRosa} strokeWidth={2} />
          <Text style={styles.title}>{DISCIPLINE_LABELS[disciplina as Discipline]}</Text>
        </View>
        <Text style={styles.subtitle}>
          Los que aparecen en tus sesiones, con cómo se hacen, para qué sirven y el error más común.
          Sin video todavía.
        </Text>

        <View style={styles.lista}>
          {categorias.map((grupo) => (
            <ScoreCard
              key={grupo.categoria}
              icon={Icono}
              tint={colors.paloRosa}
              title={grupo.categoria}
              summary={`${grupo.ejercicios.length} ${grupo.ejercicios.length === 1 ? "ejercicio" : "ejercicios"}`}
              onPress={() => setCategoriaAbierta(grupo.categoria)}
            />
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={categoriaActual !== null}
        animationType="slide"
        onRequestClose={() => setCategoriaAbierta(null)}
      >
        <SafeAreaView style={styles.screen} edges={["top"]}>
          <ScrollView contentContainerStyle={styles.content}>
            <Pressable onPress={() => setCategoriaAbierta(null)} hitSlop={10} style={styles.back}>
              <ChevronLeft size={22} color={colors.paloRosa} strokeWidth={2} />
              <Text style={styles.backText}>Atrás</Text>
            </Pressable>
            <Text style={styles.title}>{categoriaActual?.categoria}</Text>

            {ORDEN_NIVEL.map((nivel) => {
              const delNivel = (categoriaActual?.ejercicios ?? []).filter(
                (ejercicio) => ejercicio.nivel === nivel,
              );
              if (delNivel.length === 0) return null;
              return (
                <View key={nivel} style={styles.nivelBloque}>
                  <SectionLabel>{NIVEL_LABEL[nivel]}</SectionLabel>
                  <View style={styles.filas}>
                    {delNivel.map((ejercicio) => (
                      <EjercicioFila key={ejercicio.id} ejercicio={ejercicio} />
                    ))}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function EjercicioFila({ ejercicio }: { ejercicio: EjercicioDisciplina }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.fila}>
      <Text style={styles.filaNombre}>{ejercicio.nombre}</Text>
      <InfoTip titulo={ejercicio.nombre}>
        <TextoInfo>Cómo: {ejercicio.como}</TextoInfo>
        <TextoInfo>Para qué: {ejercicio.para}</TextoInfo>
        <TextoInfo>Ojo con: {ejercicio.ojo}</TextoInfo>
      </InfoTip>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.obsidiana },
    content: { padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.sm },
    back: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      paddingVertical: spacing.sm,
      alignSelf: "flex-start",
    },
    backText: { fontFamily: fonts.sansMedium, ...typeScale.body, color: colors.paloRosa },
    header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
    title: { fontFamily: fonts.sansBold, ...typeScale.title, color: colors.marfil },
    subtitle: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosaLight, marginTop: spacing.xs },
    lista: { gap: spacing.md, marginTop: spacing.md },
    nivelBloque: { gap: spacing.sm, marginTop: spacing.lg },
    filas: { gap: spacing.sm },
    fila: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBg,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    filaNombre: { flex: 1, fontFamily: fonts.sansSemiBold, ...typeScale.bodySm, color: colors.marfil },
  });
