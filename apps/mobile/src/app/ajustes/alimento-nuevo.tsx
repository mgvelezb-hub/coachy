import { useLocalSearchParams, useRouter } from "expo-router";
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
import { LoadingState } from "@/components/States";
import { useTheme } from "@/context/theme";
import {
  ApiError,
  deleteAlimentoPropio,
  getAlimentosPropios,
  patchAlimentoPropio,
  postAlimentoPropio,
  type GrupoAlimento,
  type UnidadPorcion,
} from "@/lib/api";
import {
  PORCION_POR_GRUPO,
  kcalPor100,
  num,
  problemaDelAlimento,
  rolDe,
  type FormaDelAlimento,
} from "@/lib/alimento-propio";
import { fonts, radius, spacing, type as typeScale, type Palette } from "@/lib/theme";

/**
 * Dar de alta un alimento que el catálogo no trae.
 *
 * La búsqueda tolerante arregló la mitad del problema —"Yogurt Griego" ya
 * encuentra al "Yogur griego"—; la otra mitad es la comida que simplemente no
 * está. Aquí se captura como viene en la etiqueta, y de ahí en adelante el
 * motor la trata como a cualquier otra: si a esa comida le toca, entra.
 *
 * Hoja propia y no un renglón que se abre: son doce campos, y eso no cabe
 * dentro de la despensa sin volverla scroll infinito.
 */

const GRUPOS: Array<{ valor: GrupoAlimento; nombre: string }> = [
  { valor: "proteina", nombre: "Proteína" },
  { valor: "carbo", nombre: "Carbo" },
  { valor: "grasa", nombre: "Grasa" },
  { valor: "fruta", nombre: "Fruta" },
  { valor: "verdura", nombre: "Verdura" },
];

const UNIDADES: Array<{ valor: UnidadPorcion; nombre: string }> = [
  { valor: "g", nombre: "Gramos" },
  { valor: "pieza", nombre: "Pieza" },
  { valor: "taza", nombre: "Taza" },
  { valor: "media_taza", nombre: "½ taza" },
  { valor: "cda", nombre: "Cda" },
  { valor: "cdita", nombre: "Cdita" },
  { valor: "rebanada", nombre: "Rebanada" },
  { valor: "scoop", nombre: "Scoop" },
];

/** La forma vacía, con la porción de casa que le toca a ese grupo. */
function formaInicial(nombre: string, grupo: GrupoAlimento): FormaDelAlimento {
  const porcion = PORCION_POR_GRUPO[grupo];
  return {
    nombre,
    grupo,
    proteina: "",
    carbo: "",
    grasa: "",
    fibra: "",
    unidad: porcion.unidad,
    gramosPorUnidad: String(porcion.gramosPorUnidad),
    minimo: String(porcion.minimo),
    maximo: String(porcion.maximo),
  };
}

export default function AlimentoNuevoScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const params = useLocalSearchParams<{ id?: string; nombre?: string }>();
  const id = typeof params.id === "string" && params.id.length > 0 ? params.id : null;

  const [forma, setForma] = useState<FormaDelAlimento>(() =>
    formaInicial(typeof params.nombre === "string" ? params.nombre : "", "proteina"),
  );
  const [cargando, setCargando] = useState(id !== null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!id) return;
    try {
      const { alimentos } = await getAlimentosPropios();
      const suyo = alimentos.find((alimento) => alimento.id === id);
      if (suyo) {
        setForma({
          nombre: suyo.name,
          grupo: suyo.grupo,
          proteina: String(suyo.proteinPer100),
          carbo: String(suyo.carbPer100),
          grasa: String(suyo.fatPer100),
          fibra: suyo.fiberPer100 > 0 ? String(suyo.fiberPer100) : "",
          unidad: suyo.servingUnit,
          gramosPorUnidad: String(suyo.gramsPerUnit),
          minimo: String(suyo.minUnits),
          maximo: String(suyo.maxUnits),
        });
      }
    } catch (problema) {
      setMsg(problema instanceof ApiError ? problema.message : "No se pudo cargar tu alimento");
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function editar(campo: keyof FormaDelAlimento, valor: string) {
    setMsg(null);
    setForma((previa) => ({ ...previa, [campo]: valor }));
  }

  /** Cambiar de grupo trae su porción de casa, mientras nadie la haya tocado. */
  function elegirGrupo(grupo: GrupoAlimento) {
    setMsg(null);
    setForma((previa) => {
      const anterior = PORCION_POR_GRUPO[previa.grupo];
      const sinTocar =
        previa.unidad === anterior.unidad &&
        num(previa.gramosPorUnidad) === anterior.gramosPorUnidad &&
        num(previa.minimo) === anterior.minimo &&
        num(previa.maximo) === anterior.maximo;
      if (!sinTocar) return { ...previa, grupo };

      const porcion = PORCION_POR_GRUPO[grupo];
      return {
        ...previa,
        grupo,
        unidad: porcion.unidad,
        gramosPorUnidad: String(porcion.gramosPorUnidad),
        minimo: String(porcion.minimo),
        maximo: String(porcion.maximo),
      };
    });
  }

  async function guardar() {
    const problema = problemaDelAlimento(forma);
    if (problema) {
      setMsg(problema);
      return;
    }

    setGuardando(true);
    setMsg(null);
    const entrada = {
      name: forma.nombre.trim(),
      role: rolDe(forma.grupo, num(forma.grasa)),
      proteinPer100: num(forma.proteina),
      carbPer100: num(forma.carbo),
      fatPer100: num(forma.grasa),
      fiberPer100: num(forma.fibra),
      servingUnit: forma.unidad,
      gramsPerUnit: num(forma.gramosPorUnidad),
      minUnits: num(forma.minimo),
      maxUnits: num(forma.maximo),
      enDespensa: true,
    };

    try {
      if (id) await patchAlimentoPropio(id, entrada);
      else await postAlimentoPropio(entrada);
      router.back();
    } catch (problemaApi) {
      setMsg(
        problemaApi instanceof ApiError ? problemaApi.message : "No se pudo guardar tu alimento",
      );
    } finally {
      setGuardando(false);
    }
  }

  function borrar() {
    if (!id) return;
    Alert.alert("Borrar este alimento", "Sale de tu alacena y de tus próximos menús.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteAlimentoPropio(id);
              router.back();
            } catch (problema) {
              setMsg(
                problema instanceof ApiError ? problema.message : "No se pudo borrar tu alimento",
              );
            }
          })();
        },
      },
    ]);
  }

  const kcal = kcalPor100(forma.proteina, forma.carbo, forma.grasa);

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

          <Text style={styles.title}>{id ? "Editar mi alimento" : "Alimento nuevo"}</Text>

          {cargando && <LoadingState label="Cargando tu alimento..." />}

          {!cargando && (
            <>
              <Card>
                <TextInput
                  value={forma.nombre}
                  onChangeText={(valor) => editar("nombre", valor)}
                  placeholder="Nombre"
                  placeholderTextColor={colors.paloRosa}
                  style={styles.campo}
                  autoCorrect={false}
                />
                <View style={styles.chips}>
                  {GRUPOS.map((grupo) => (
                    <Chip
                      key={grupo.valor}
                      label={grupo.nombre}
                      selected={forma.grupo === grupo.valor}
                      onPress={() => elegirGrupo(grupo.valor)}
                    />
                  ))}
                </View>
              </Card>

              <Card>
                <View style={styles.tituloFila}>
                  <SectionLabel>Por cada 100 g</SectionLabel>
                  <InfoTip titulo="Por cada 100 g">
                    <TextoInfo>
                      Copia lo que dice la etiqueta en la columna de 100 g. Las calorías las
                      calculamos solas.
                    </TextoInfo>
                  </InfoTip>
                </View>
                <Macro label="Proteína" valor={forma.proteina} onChange={(v) => editar("proteina", v)} styles={styles} colors={colors} />
                <Macro label="Carbohidrato" valor={forma.carbo} onChange={(v) => editar("carbo", v)} styles={styles} colors={colors} />
                <Macro label="Grasa" valor={forma.grasa} onChange={(v) => editar("grasa", v)} styles={styles} colors={colors} />
                <Macro label="Fibra" valor={forma.fibra} onChange={(v) => editar("fibra", v)} styles={styles} colors={colors} />
                <View style={styles.fila}>
                  <Text style={styles.filaLabel}>Calorías</Text>
                  <Text style={styles.filaValor}>{`${kcal} kcal`}</Text>
                </View>
              </Card>

              <Card>
                <SectionLabel>Tu porción</SectionLabel>
                <View style={styles.chips}>
                  {UNIDADES.map((unidad) => (
                    <Chip
                      key={unidad.valor}
                      label={unidad.nombre}
                      selected={forma.unidad === unidad.valor}
                      onPress={() => editar("unidad", unidad.valor)}
                    />
                  ))}
                </View>
                <Macro label="Gramos por unidad" valor={forma.gramosPorUnidad} onChange={(v) => editar("gramosPorUnidad", v)} styles={styles} colors={colors} />
                <Macro label="Mínimo por comida" valor={forma.minimo} onChange={(v) => editar("minimo", v)} styles={styles} colors={colors} />
                <Macro label="Máximo por comida" valor={forma.maximo} onChange={(v) => editar("maximo", v)} styles={styles} colors={colors} />
              </Card>

              {msg && <Text style={styles.msg}>{msg}</Text>}

              {id && (
                <Pressable onPress={borrar} style={styles.borrar}>
                  <Text style={styles.borrarText}>Borrar este alimento</Text>
                </Pressable>
              )}
            </>
          )}
        </ScrollView>

        <View style={styles.pie}>
          <PrimaryButton
            label="Guardar y marcar en mi alacena"
            onPress={() => void guardar()}
            loading={guardando}
            disabled={cargando}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Un número de la etiqueta: una línea, su nombre a la izquierda. */
function Macro({
  label,
  valor,
  onChange,
  styles,
  colors,
}: {
  label: string;
  valor: string;
  onChange: (valor: string) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: Palette;
}) {
  return (
    <View style={styles.fila}>
      <Text style={styles.filaLabel}>{label}</Text>
      <TextInput
        value={valor}
        onChangeText={onChange}
        placeholder="0"
        placeholderTextColor={colors.paloRosa}
        keyboardType="decimal-pad"
        style={styles.filaInput}
      />
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
      // El botón fijo del pie tapa el final del formulario si no se le hace sitio.
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
    title: { fontFamily: fonts.sansBold, ...typeScale.title, color: colors.marfil },
    tituloFila: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    campo: {
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
    fila: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      paddingVertical: spacing.sm,
      marginTop: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.cardBorder,
    },
    filaLabel: { fontFamily: fonts.sansMedium, ...typeScale.body, color: colors.marfil, flex: 1 },
    filaValor: { fontFamily: fonts.sansMedium, ...typeScale.body, color: colors.champan },
    filaInput: {
      fontFamily: fonts.sansMedium,
      ...typeScale.body,
      color: colors.champan,
      minWidth: 80,
      textAlign: "right",
      paddingVertical: spacing.xs,
    },
    msg: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosa },
    borrar: { paddingVertical: spacing.md, alignSelf: "center" },
    borrarText: { fontFamily: fonts.sansMedium, ...typeScale.bodySm, color: colors.paloRosa },
    pie: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
      backgroundColor: colors.obsidiana,
      borderTopWidth: 1,
      borderTopColor: colors.cardBorder,
    },
  });
