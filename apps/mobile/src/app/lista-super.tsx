import { useRouter } from "expo-router";
import { CheckCircle2, ChevronLeft, Circle } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { useTheme } from "@/context/theme";
import { ApiError, getNutrition, type GroceryItem } from "@/lib/api";
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
 * Lo tachado se guarda SOLO en el teléfono (`lib/lista-super.ts`): es
 * progreso de compra, no un dato del plan, y el servidor no se entera.
 */
export default function ListaSuperScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [groceries, setGroceries] = useState<GroceryItem[] | null>(null);
  const [comprados, setComprados] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nutrition, guardados] = await Promise.all([getNutrition(), leeComprados()]);
      setGroceries(nutrition.groceries);
      setComprados(guardados);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar tu lista de súper");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function marcar(nombre: string) {
    setComprados((previo) => {
      const siguiente = previo.includes(nombre)
        ? previo.filter((n) => n !== nombre)
        : [...previo, nombre];
      void guardaComprados(siguiente);
      return siguiente;
    });
  }

  function empezarDeNuevo() {
    setComprados([]);
    void guardaComprados([]);
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
  });
