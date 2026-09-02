import { useFocusEffect, useRouter } from "expo-router";
import { CheckCircle2, ChevronLeft, Circle, Users } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { useTheme } from "@/context/theme";
import { ApiError, getNutrition, type GroceryItem } from "@/lib/api";
import { getSuperCompartido, putSuperCompartido } from "@/lib/api-household";
import { guardaComprados, leeComprados } from "@/lib/lista-super";
import { fonts, radius, spacing, type as typeScale, type Palette } from "@/lib/theme";

/**
 * La lista de súper, con lo que ya cayó al carrito tachado.
 *
 * EL CASO REAL que la hizo así: a media compra, con el carrito medio lleno,
 * ya no se sabía qué faltaba y qué no — releer la lista completa cada vez es
 * lo que esta pantalla evita. Se toca un artículo, se tacha y baja al fondo;
 * lo pendiente se queda siempre arriba, en el orden en que ya venía.
 *
 * Antes vivía como el detalle desplegable de la tarjeta "Lista de súper" en
 * Nutrición: abrirla amontonaba el resto de la pantalla debajo de una lista
 * que puede tener veinte renglones. Ahora es su propia página — Nutrición
 * solo se queda con una tarjeta compacta que trae aquí.
 *
 * Lo tachado se guarda SOLO en el teléfono (`lib/lista-super.ts`) — EXCEPTO
 * con un vínculo de hogar ACTIVO: ahí vive en el servidor (`superComprados`
 * del vínculo) para que uno tache en el súper y el otro lo vea. Sin
 * websockets: se relee al enfocar esta pantalla y después de cada toque —
 * optimista en el teléfono, PUT atrás; si el PUT falla se revierte el toque
 * y se avisa discreto, nunca se deja la pantalla mintiendo sobre qué se
 * guardó.
 */
export default function ListaSuperScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [groceries, setGroceries] = useState<GroceryItem[] | null>(null);
  const [comprados, setComprados] = useState<string[]>([]);
  // Si hay un vínculo ACTIVO, el tachado es del hogar (servidor); si no, es
  // solo de este teléfono (AsyncStorage), como siempre fue.
  const [compartida, setCompartida] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const nutrition = await getNutrition();
      setGroceries(nutrition.groceries);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar tu lista de súper");
      return;
    }

    // El estado del hogar es secundario: si esta llamada falla (sin red,
    // por ejemplo) la pantalla no se rompe, simplemente se cae a local.
    try {
      const compartido = await getSuperCompartido();
      if (compartido.compartida) {
        setCompartida(true);
        setComprados(compartido.items);
        return;
      }
    } catch {
      // Sigue abajo con el comportamiento local de siempre.
    }
    setCompartida(false);
    setComprados(await leeComprados());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function marcar(nombre: string) {
    const anterior = comprados;
    const siguiente = anterior.includes(nombre)
      ? anterior.filter((n) => n !== nombre)
      : [...anterior, nombre];
    setComprados(siguiente);
    setSyncError(null);

    if (!compartida) {
      void guardaComprados(siguiente);
      return;
    }

    try {
      await putSuperCompartido(siguiente);
    } catch {
      // El servidor no lo tiene: se revierte el toque en vez de dejar la
      // pantalla mostrando algo que la otra persona nunca va a ver.
      setComprados(anterior);
      setSyncError("No se pudo guardar. Vuelve a intentar.");
    }
  }

  async function empezarDeNuevo() {
    const anterior = comprados;
    setComprados([]);
    setSyncError(null);

    if (!compartida) {
      void guardaComprados([]);
      return;
    }

    try {
      await putSuperCompartido([]);
    } catch {
      setComprados(anterior);
      setSyncError("No se pudo guardar. Vuelve a intentar.");
    }
  }

  if (!groceries && !error) return <LoadingState label="Cargando tu lista..." />;
  if (!groceries && error) return <ErrorState message={error} onRetry={load} />;
  if (!groceries) return null;

  const compradosSet = new Set(comprados);
  // Pendientes arriba, comprados al fondo — cada grupo conserva el orden con
  // el que ya venía la lista, así nadie tiene que reordenar en su cabeza.
  const pendientes = groceries.filter((item) => !compradosSet.has(item.name));
  const marcados = groceries.filter((item) => compradosSet.has(item.name));
  const ordenados = [...pendientes, ...marcados];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.paloRosa} />
        }
      >
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <ChevronLeft size={22} color={colors.paloRosa} strokeWidth={2} />
          <Text style={styles.backText}>Atrás</Text>
        </Pressable>

        <Text style={styles.title}>Lista de súper</Text>
        <Text style={styles.subtitulo}>
          {groceries.length === 0
            ? "Sin artículos todavía"
            : `Quedan ${pendientes.length} de ${groceries.length}`}
        </Text>

        {compartida && (
          <View style={styles.compartidaFila}>
            <Users size={14} color={colors.paloRosaLight} strokeWidth={2} />
            <Text style={styles.compartidaTexto}>Lista compartida con tu hogar</Text>
          </View>
        )}

        {groceries.length === 0 ? (
          <EmptyState message="Cuando tengas menús publicados, la lista se arma sola." />
        ) : (
          <View style={styles.lista}>
            {ordenados.map((item) => {
              const marcado = compradosSet.has(item.name);
              return (
                <Pressable
                  key={item.name}
                  onPress={() => marcar(item.name)}
                  style={styles.fila}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: marcado }}
                >
                  {marcado ? (
                    <CheckCircle2 size={22} color={colors.champan} strokeWidth={2} />
                  ) : (
                    <Circle size={22} color={colors.cardBorder} strokeWidth={2} />
                  )}
                  <Text style={[styles.item, marcado && styles.itemMarcado]}>
                    {item.name} —{" "}
                    {item.portion ? `${item.portion} (${item.grams} g)` : `${item.grams} ${item.unit}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {comprados.length > 0 && (
          <Pressable onPress={empezarDeNuevo} style={styles.reset} hitSlop={8}>
            <Text style={styles.resetTexto}>Empezar de nuevo</Text>
          </Pressable>
        )}

        {syncError && <Text style={styles.syncError}>{syncError}</Text>}
      </ScrollView>
    </SafeAreaView>
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
    title: {
      fontFamily: fonts.sansBold,
      ...typeScale.title,
      color: colors.marfil,
      marginBottom: -spacing.xs,
    },
    subtitulo: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.paloRosa },
    compartidaFila: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    compartidaTexto: { fontFamily: fonts.sans, ...typeScale.label, color: colors.paloRosaLight },
    lista: { gap: spacing.xs, marginTop: spacing.sm },
    fila: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      minHeight: 44,
      paddingVertical: spacing.sm,
    },
    item: { flex: 1, fontFamily: fonts.sans, ...typeScale.body, color: colors.marfil },
    itemMarcado: {
      textDecorationLine: "line-through",
      color: colors.paloRosaLight,
    },
    reset: {
      marginTop: spacing.lg,
      alignSelf: "center",
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    resetTexto: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.paloRosa },
    syncError: {
      fontFamily: fonts.sans,
      ...typeScale.bodySm,
      color: colors.error,
      textAlign: "center",
      marginTop: spacing.sm,
    },
  });
