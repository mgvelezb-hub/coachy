import {
  Droplets,
  Flame,
  FlaskConical,
  Info,
  MessageCircleQuestion,
  Salad,
  ShoppingBasket,
  UtensilsCrossed,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { ScoreCard } from "@/components/ScoreCard";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { useTheme } from "@/context/theme";
import { useScrollTop } from "@/lib/scroll-top";
import {
  ApiError,
  getCheckins,
  getMe,
  getNutrition,
  preguntarNutricion,
  type ConsultaResponse,
  type MeResponse,
  type Menu,
  type NutritionResponse,
} from "@/lib/api";
import { DIETA_ACTUAL, PORQUE_DEL_PLAN, PRESUPUESTOS, aguaDelDia } from "@/lib/nutricion";
import { fonts, spacing, type as typeScale, type Palette } from "@/lib/theme";

/**
 * Nutrición — todo lo de comer que NO es de hoy.
 *
 * Hoy se queda con la comida del día (qué toca y a qué hora); aquí viven los
 * menús completos, las equivalencias y la lista de súper, que son decisiones
 * de semana: se miran cuando se planea o se va al mercado, no entre series.
 *
 * Fase 1 mueve de casa lo que ya existía en Hoy. El tipo de dieta, sus
 * beneficios, los platillos por tiempo de preparación y el porqué de cada
 * alimento entran en la fase de Nutrición, no aquí.
 */

/** true si el error de API es "onboarding incompleto" (403): no es una falla real. */
function isOnboardingIncomplete(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

export default function NutricionScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Tocar esta pestaña estando en ella regresa el scroll hasta arriba.
  const scrollRef = useScrollTop();
  const [data, setData] = useState<NutritionResponse | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  /** El peso más reciente: es lo que dimensiona el agua del día. */
  const [pesoKg, setPesoKg] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const nutrition = await getNutrition().catch((e) =>
        isOnboardingIncomplete(e) ? null : Promise.reject(e),
      );
      setData(nutrition ?? { decision: null, menus: [], groceries: [], materialized: false });

      const [perfil, checkins] = await Promise.all([
        getMe().catch(() => null),
        getCheckins(4).catch(() => null),
      ]);
      setMe(perfil);
      setPesoKg(checkins?.checkIns.find((fila) => fila.weightKg !== null)?.weightKg ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar tu alimentación");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!data && !error) return <LoadingState label="Cargando tu alimentación..." />;
  if (!data && error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const { decision, menus, groceries } = data;
  const agua = aguaDelDia(pesoKg);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.paloRosa} />
      }
    >
      <Text style={styles.titulo}>Nutrición</Text>

      <ScoreCard
        icon={Flame}
        tint={colors.champan}
        title="Tu plan"
        summary={
          decision
            ? `${decision.kcal} kcal · P ${decision.proteinG} · C ${decision.carbsG} · G ${decision.fatG}`
            : "Sin plan publicado todavía"
        }
        status={decision ? { label: decision.phase.replace(/_/g, " "), tone: "ok" } : null}
      >
        {decision ? (
          <View style={styles.macros}>
            <Macro label="Proteína" valor={`${decision.proteinG} g`} />
            <Macro label="Carbohidratos" valor={`${decision.carbsG} g`} />
            <Macro label="Grasas" valor={`${decision.fatG} g`} />
          </View>
        ) : (
          <EmptyState message="En cuanto tu coach publique tu decisión, aquí aparecen tus números." />
        )}
      </ScoreCard>

      <ScoreCard
        icon={Salad}
        tint={colors.paloRosa}
        title="Tu dieta"
        summary={`${DIETA_ACTUAL.nombre} · ${me?.profile?.mealsPerDay ?? "—"} comidas al día`}
        status={
          me?.profile
            ? {
                label: `Presupuesto ${PRESUPUESTOS.find((p) => p.valor === me.profile!.budget)?.nombre.toLowerCase() ?? ""}`,
                tone: "neutral",
              }
            : null
        }
      >
        <Text style={styles.parrafo}>{DIETA_ACTUAL.resumen}</Text>
        {DIETA_ACTUAL.puntos.map((punto) => (
          <Text key={punto} style={styles.vinneta}>
            · {punto}
          </Text>
        ))}
        <Text style={styles.aviso}>
          El presupuesto se cambia en Ajustes → Nutrición, y entra en tu siguiente check-in: el
          menú de esta semana ya se compró.
        </Text>
      </ScoreCard>

      <ScoreCard
        icon={Droplets}
        tint={colors.champan}
        title="Agua del día"
        summary={
          agua === null
            ? "Registra tu peso en el check-in para calcularla"
            : `${agua} litros · ${me?.profile?.mealsPerDay ?? 4} tomas de referencia`
        }
      >
        <Text style={styles.parrafo}>
          {agua === null
            ? "Sale de tu peso: 35 ml por kilo al día, que es la referencia práctica para una persona adulta sana con actividad moderada."
            : `Son 35 ml por kilo de tu peso (${pesoKg} kg), la referencia práctica para actividad moderada. Sube con el calor y con las sesiones largas; si entrenas fuerte, agrégale medio litro ese día.`}
        </Text>
      </ScoreCard>

      <ScoreCard
        icon={Info}
        tint={colors.guindaLight}
        title="Por qué tu plan se ve así"
        summary="Las reglas que arman tu menú, en español"
      >
        {PORQUE_DEL_PLAN.map((bloque) => (
          <View key={bloque.titulo} style={styles.bloque}>
            <Text style={styles.bloqueTitulo}>{bloque.titulo}</Text>
            <Text style={styles.parrafo}>{bloque.texto}</Text>
          </View>
        ))}
        <Text style={styles.aviso}>
          Esto explica un plan generado por reglas; no es una indicación médica. Si tienes una
          condición que cambie tu alimentación, consúltalo con una especialista.
        </Text>
      </ScoreCard>

      {menus.map((menu) => (
        <MenuCard key={menu.menuNumber} menu={menu} />
      ))}

      <ScoreCard
        icon={ShoppingBasket}
        tint={colors.paloRosa}
        title="Lista de súper"
        summary={
          groceries.length === 0
            ? "Se arma sola con tus menús"
            : `${groceries.length} ${groceries.length === 1 ? "artículo" : "artículos"} para la semana`
        }
      >
        {groceries.length === 0 ? (
          <EmptyState message="Cuando tengas menús publicados, la lista se arma sola." />
        ) : (
          groceries.map((item) => (
            <Text key={item.name} style={styles.item}>
              · {item.name} — {item.grams} {item.unit}
            </Text>
          ))
        )}
      </ScoreCard>
      {/* Abajo lo excepcional: preguntar y cargar estudios se hace de vez en
          cuando; el menú de la semana se abre a diario. */}
      <PreguntaAlPlan />

      <EstudiosCard />
    </ScrollView>
  );
}

function MenuCard({ menu }: { menu: Menu }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const primera = menu.meals[0];
  const resumen =
    menu.meals.length === 0
      ? "Sin comidas"
      : `${menu.meals.length} comidas · empieza ${primera?.timeHint ?? ""}`.trim();

  return (
    <ScoreCard
      icon={UtensilsCrossed}
      tint={colors.guindaLight}
      title={`Menú ${menu.menuNumber}`}
      summary={resumen}
    >
      {menu.meals.map((meal) => (
        <View key={meal.slot} style={styles.meal}>
          <Text style={styles.mealLabel}>
            {meal.label} · {meal.timeHint}
          </Text>
          {meal.items.map((item) => (
            <Text key={item.name} style={styles.item}>
              · {item.name} {item.free ? "(libre)" : `— ${item.grams} g`}
            </Text>
          ))}
          {meal.equivalences.map((equivalencia) => (
            <Text key={equivalencia.forName} style={styles.equivalencia}>
              {equivalencia.forName} se puede cambiar por{" "}
              {equivalencia.options.map((option) => `${option.name} (${option.grams} g)`).join(", ")}
            </Text>
          ))}
        </View>
      ))}
    </ScoreCard>
  );
}

function Macro({ label, valor }: { label: string; valor: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.macro}>
      <Text style={styles.macroValor}>{valor}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

/**
 * Pregúntale a tu plan.
 *
 * Explica lo que el motor ya decidió; no arma planes nuevos ni mueve números.
 * Las preguntas clínicas las frena el servidor **antes** de redactar nada: el
 * freno vive en un `if`, no en una instrucción del prompt que se pueda rodear
 * pidiendo lo mismo de otra manera.
 */
function PreguntaAlPlan() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState<ConsultaResponse | null>(null);
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    if (pregunta.trim().length < 3) return;
    setPensando(true);
    setError(null);
    try {
      setRespuesta(await preguntarNutricion(pregunta.trim()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo responder ahora");
    } finally {
      setPensando(false);
    }
  }

  return (
    <ScoreCard
      icon={MessageCircleQuestion}
      tint={colors.champan}
      title="Pregúntale a tu plan"
      summary="Por qué esos alimentos, cómo cambiar uno, qué hacer si comes fuera"
      status={null}
    >
      <TextInput
        value={pregunta}
        onChangeText={setPregunta}
        placeholder="¿Puedo cambiar el pollo por atún?"
        placeholderTextColor={colors.paloRosaLight}
        multiline
        style={styles.consultaInput}
      />

      <Pressable
        onPress={enviar}
        disabled={pensando}
        style={[styles.consultaBoton, pensando && styles.consultaBotonOff]}
      >
        <Text style={styles.consultaBotonText}>{pensando ? "Pensando..." : "Preguntar"}</Text>
      </Pressable>

      {error && <Text style={styles.consultaAviso}>{error}</Text>}

      {respuesta && (
        <View style={styles.consultaRespuesta}>
          <Text style={styles.consultaTexto}>{respuesta.answer}</Text>
          <Text style={styles.consultaAviso}>{respuesta.disclaimer}</Text>
        </View>
      )}
    </ScoreCard>
  );
}

/** Acceso a los estudios: se guardan y se grafican, no se interpretan. */
function EstudiosCard() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <ScoreCard
      icon={FlaskConical}
      tint={colors.paloRosa}
      title="Tus estudios"
      summary="InBody y química sanguínea, con su historial"
      status={null}
    >
      <Text style={styles.consultaAviso}>
        Se guardan y se grafican. La app no los interpreta: lo que salga fuera del rango de tu
        laboratorio lo revisa un médico.
      </Text>

      <Pressable onPress={() => router.push("/laboratorios")} style={styles.consultaBoton}>
        <Text style={styles.consultaBotonText}>Abrir mis estudios</Text>
      </Pressable>
    </ScoreCard>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  consultaInput: {
    marginTop: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBg,
    padding: spacing.md,
    minHeight: 64,
    fontFamily: fonts.sansMedium,
    ...typeScale.body,
    color: colors.marfil,
  },
  consultaBoton: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.guinda,
    alignItems: "center",
  },
  consultaBotonOff: { opacity: 0.5 },
  consultaBotonText: { fontFamily: fonts.sansSemiBold, ...typeScale.body, color: colors.pergamino },
  consultaRespuesta: { marginTop: spacing.md, gap: spacing.sm },
  consultaTexto: { fontFamily: fonts.sans, ...typeScale.body, color: colors.marfil },
  consultaAviso: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.paloRosaLight,
    marginTop: spacing.sm,
  },
  parrafo: {
    fontFamily: fonts.sans,
    ...typeScale.body,
    color: colors.marfil,
  },
  vinneta: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.paloRosaLight,
  },
  bloque: { gap: spacing.xs },
  bloqueTitulo: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.body,
    color: colors.champan,
  },
  aviso: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.paloRosaLight,
    marginTop: spacing.sm,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.obsidiana,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.md,
  },
  titulo: {
    fontFamily: fonts.sansBold,
    ...typeScale.title,
    color: colors.marfil,
    marginBottom: spacing.xs,
  },
  macros: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  macro: {
    gap: 2,
  },
  macroValor: {
    fontFamily: fonts.sansBold,
    ...typeScale.heading,
    color: colors.marfil,
  },
  macroLabel: {
    fontFamily: fonts.sansMedium,
    ...typeScale.label,
    color: colors.paloRosa,
  },
  meal: {
    gap: 2,
  },
  mealLabel: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.bodySm,
    color: colors.paloRosa,
    marginBottom: 2,
  },
  item: {
    fontFamily: fonts.sans,
    ...typeScale.body,
    color: colors.marfil,
  },
  equivalencia: {
    fontFamily: fonts.serifItalic,
    ...typeScale.bodySm,
    color: colors.paloRosaLight,
    marginTop: spacing.xs,
  },
});
