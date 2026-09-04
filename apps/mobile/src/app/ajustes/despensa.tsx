import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/Card";
import { Chip } from "@/components/Chip";
import { InfoTip, TextoInfo } from "@/components/InfoTip";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SectionLabel } from "@/components/SectionLabel";
import { ErrorState, LoadingState } from "@/components/States";
import { useTheme } from "@/context/theme";
import {
  ApiError,
  getDespensa,
  patchDespensa,
  type AlimentoDeCatalogo,
  type GrupoDespensa,
} from "@/lib/api";
import { coincide } from "@/lib/busqueda-alimentos";
import { fonts, radius, spacing, type as typeScale, type Palette } from "@/lib/theme";

/**
 * La despensa: lo que ya está comprado.
 *
 * El motor rota alimentos cada quincena y esa rotación dejó sin uso despensas
 * enteras compradas con el menú anterior. Aquí se declara qué hay en casa, y
 * el motor lo elige primero dentro de cada rol al armar la semana.
 *
 * Es una hoja propia y no un renglón que se abre hacia abajo: la lista es el
 * catálogo entero, con buscador y filtros, y eso no cabe dentro de Ajustes sin
 * convertir la sección en scroll infinito.
 */

const GRUPOS: Array<{ valor: GrupoDespensa; nombre: string }> = [
  { valor: "proteina", nombre: "Proteína" },
  { valor: "carbo", nombre: "Carbo" },
  { valor: "grasa", nombre: "Grasa" },
  { valor: "fruta", nombre: "Fruta" },
  { valor: "verdura", nombre: "Verdura" },
];

export default function DespensaScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [catalogo, setCatalogo] = useState<AlimentoDeCatalogo[]>([]);
  const [deTuLista, setDeTuLista] = useState<string[]>([]);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [grupo, setGrupo] = useState<GrupoDespensa | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    setCargando(true);
    try {
      const respuesta = await getDespensa();
      setCatalogo(respuesta.catalogo);
      setDeTuLista(respuesta.deTuLista);
      setMarcados(respuesta.pantry);
    } catch (problema) {
      setError(problema instanceof ApiError ? problema.message : "No se pudo cargar tu despensa");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function alternar(id: string) {
    setMsg(null);
    setMarcados((previos) =>
      previos.includes(id) ? previos.filter((entrada) => entrada !== id) : [...previos, id],
    );
  }

  const termino = busqueda.trim();

  const filtrados = useMemo(() => {
    return catalogo.filter((alimento) => {
      if (grupo && alimento.grupo !== grupo) return false;
      // Perdona acentos, mayúsculas, plurales y la palabra regional: el bug
      // fue buscar "Yogurt Griego" y no ver el "Yogur griego natural 0%".
      return coincide(alimento, termino);
    });
  }, [catalogo, grupo, termino]);

  // Lo del menú vigente va arriba y solo mientras no se busca: es el atajo
  // para marcar de un jalón lo que se acaba de comprar con la lista de súper.
  const deLaLista = useMemo(() => {
    if (termino || grupo) return [];
    return catalogo.filter((alimento) => deTuLista.includes(alimento.id));
  }, [catalogo, deTuLista, termino, grupo]);

  async function guardar(rearmar: boolean) {
    setGuardando(true);
    setMsg(null);
    try {
      const respuesta = await patchDespensa(marcados, rearmar);
      if (respuesta.congelado && !respuesta.rearmado) {
        // Ya comiste con este menú: rehacerlo cambia días que ya viviste, así
        // que se pregunta en vez de decidirlo por ti.
        Alert.alert(
          "Tu semana ya empezó",
          "Guardamos tu despensa. ¿Rearmamos el menú de hoy en adelante? Lo que ya registraste se queda como está.",
          [
            { text: "Después", style: "cancel" },
            { text: "Rearmar", onPress: () => void guardar(true) },
          ],
        );
        setMsg("Guardado. Entra en tu siguiente menú.");
        return;
      }
      setMsg(respuesta.rearmado ? "Listo: tu semana ya usa lo que tienes en casa." : "Guardado.");
      router.back();
    } catch (problema) {
      setMsg(problema instanceof ApiError ? problema.message : "No se pudo guardar tu despensa");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
            <ChevronLeft size={22} color={colors.paloRosa} strokeWidth={2} />
            <Text style={styles.backText}>Atrás</Text>
          </Pressable>

          <View style={styles.tituloFila}>
            <Text style={styles.title}>Lo que tengo en casa</Text>
            <InfoTip titulo="Lo que tengo en casa">
              <TextoInfo>
                Lo que marques se elige primero al armar tu semana, mientras cuadre con tus
                comidas. Así lo que ya compraste se usa en vez de quedarse en la alacena cuando
                el menú cambia. Nunca se mete a la fuerza: si no le toca a esa comida, no entra.
              </TextoInfo>
            </InfoTip>
          </View>

          {cargando && <LoadingState label="Cargando el catálogo..." />}
          {!cargando && error && <ErrorState message={error} onRetry={cargar} />}

          {!cargando && !error && (
            <>
              <Card>
                <TextInput
                  value={busqueda}
                  onChangeText={setBusqueda}
                  placeholder="Buscar alimento"
                  placeholderTextColor={colors.paloRosa}
                  style={styles.buscador}
                  autoCorrect={false}
                />
                <View style={styles.chips}>
                  <Chip label="Todo" selected={grupo === null} onPress={() => setGrupo(null)} />
                  {GRUPOS.map((entrada) => (
                    <Chip
                      key={entrada.valor}
                      label={entrada.nombre}
                      selected={grupo === entrada.valor}
                      onPress={() => setGrupo(grupo === entrada.valor ? null : entrada.valor)}
                    />
                  ))}
                </View>
              </Card>

              {deLaLista.length > 0 && (
                <Card>
                  <SectionLabel>De tu última lista de súper</SectionLabel>
                  <View style={styles.lista}>
                    {deLaLista.map((alimento) => (
                      <Fila
                        key={alimento.id}
                        alimento={alimento}
                        activo={marcados.includes(alimento.id)}
                        onPress={() => alternar(alimento.id)}
                        styles={styles}
                      />
                    ))}
                  </View>
                </Card>
              )}

              <Card>
                <SectionLabel>{`Tu despensa · ${marcados.length}`}</SectionLabel>
                <View style={styles.lista}>
                  {filtrados.map((alimento) => (
                    <Fila
                      key={alimento.id}
                      alimento={alimento}
                      activo={marcados.includes(alimento.id)}
                      onPress={() => alternar(alimento.id)}
                      styles={styles}
                    />
                  ))}
                </View>
              </Card>

              {msg && <Text style={styles.msg}>{msg}</Text>}
            </>
          )}
        </ScrollView>

        <View style={styles.pie}>
          <PrimaryButton
            label="Rearmar mi semana con esto"
            onPress={() => void guardar(false)}
            loading={guardando}
            disabled={cargando || Boolean(error)}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Un alimento del catálogo: una línea, un toque. */
function Fila({
  alimento,
  activo,
  onPress,
  styles,
}: {
  alimento: AlimentoDeCatalogo;
  activo: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.fila, activo && styles.filaOn]}>
      <Text style={[styles.filaNombre, activo && styles.filaNombreOn]} numberOfLines={1}>
        {activo ? "✓ " : ""}
        {alimento.nombre}
      </Text>
    </Pressable>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.obsidiana },
    flex: { flex: 1 },
    content: {
      padding: spacing.lg,
      gap: spacing.lg,
      // El botón fijo del pie tapa el final de la lista si no se le hace sitio.
      paddingBottom: spacing.huge * 2,
    },
    back: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      paddingVertical: spacing.sm,
      alignSelf: "flex-start",
    },
    backText: { fontFamily: fonts.sansMedium, ...typeScale.body, color: colors.paloRosa },
    tituloFila: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    title: { fontFamily: fonts.sansBold, ...typeScale.title, color: colors.marfil, flex: 1 },
    buscador: {
      fontFamily: fonts.sans,
      ...typeScale.body,
      color: colors.marfil,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
    lista: { gap: spacing.sm, marginTop: spacing.md },
    fila: {
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    filaOn: { borderColor: colors.champan },
    filaNombre: { fontFamily: fonts.sansMedium, ...typeScale.body, color: colors.marfil },
    filaNombreOn: { color: colors.champan },
    msg: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
    pie: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
      backgroundColor: colors.obsidiana,
      borderTopWidth: 1,
      borderTopColor: colors.cardBorder,
    },
  });
