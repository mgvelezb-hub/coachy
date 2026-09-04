import { useFocusEffect, useRouter } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
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

  // Se recarga al volver: la hoja de alimento nuevo pudo agregar uno, editarlo
  // o borrarlo, y el catalogo de esta pantalla es justo el que cambio.
  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  function alternar(id: string) {
    setMsg(null);
    setMarcados((previos) =>
      previos.includes(id) ? previos.filter((entrada) => entrada !== id) : [...previos, id],
    );
  }

  const termino = busqueda.trim();

  /**
   * Lo que no está en el catálogo se da de alta en su propia hoja, con lo que
   * ya se había escrito en el buscador: quien tecleó "yogurt griego" y no lo
   * encontró no tiene que volver a escribirlo.
   */
  function agregarPropio() {
    router.push({
      pathname: "/ajustes/alimento-nuevo",
      params: termino ? { nombre: termino } : {},
    } as never);
  }

  /** Los tuyos se editan y se borran desde su misma hoja. */
  function editarPropio(idMotor: string) {
    router.push({
      pathname: "/ajustes/alimento-nuevo",
      params: { id: idMotor.replace("custom:", "") },
    } as never);
  }


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
                        onEditar={() => editarPropio(alimento.id)}
                        styles={styles}
                        colors={colors}
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
                      onEditar={() => editarPropio(alimento.id)}
                      styles={styles}
                      colors={colors}
                    />
                  ))}
                  <Pressable onPress={agregarPropio} style={styles.agregar}>
                    <Text style={styles.agregarText} numberOfLines={1}>
                      {termino ? `Agregar «${termino}» como alimento nuevo` : "Agregar un alimento que no está"}
                    </Text>
                  </Pressable>
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

/**
 * Un alimento del catálogo: una línea, un toque. Los tuyos traen además la
 * flecha que lleva a editarlos, que es lo único que se puede hacer con ellos
 * y no con los del catálogo.
 */
function Fila({
  alimento,
  activo,
  onPress,
  onEditar,
  styles,
  colors,
}: {
  alimento: AlimentoDeCatalogo;
  activo: boolean;
  onPress: () => void;
  onEditar: () => void;
  styles: ReturnType<typeof makeStyles>;
  colors: Palette;
}) {
  return (
    <View style={[styles.fila, activo && styles.filaOn]}>
      <Pressable onPress={onPress} style={styles.filaToque}>
        <Text style={[styles.filaNombre, activo && styles.filaNombreOn]} numberOfLines={1}>
          {activo ? "✓ " : ""}
          {alimento.nombre}
        </Text>
      </Pressable>
      {alimento.tuyo === true && (
        <Pressable onPress={onEditar} hitSlop={10} accessibilityLabel={`Editar ${alimento.nombre}`}>
          <ChevronRight size={18} color={colors.paloRosa} strokeWidth={2} />
        </Pressable>
      )}
    </View>
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
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    filaToque: { flex: 1 },
    filaOn: { borderColor: colors.champan },
    agregar: { paddingVertical: spacing.md, paddingHorizontal: spacing.md },
    agregarText: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.champan },
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
