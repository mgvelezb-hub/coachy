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
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { Card } from "@/components/Card";
import { ScoreCard } from "@/components/ScoreCard";
import { SectionLabel } from "@/components/SectionLabel";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { useTheme } from "@/context/theme";
import { useScrollTop } from "@/lib/scroll-top";
import {
  ApiError,
  getCheckins,
  getMe,
  getNutrition,
  postSwap,
  preguntarNutricion,
  type ConsultaResponse,
  type MeResponse,
  putMenuPreferido,
  type GroceryItem,
  type Menu,
  type MenuPreference,
  type MenuMeal,
  type NutritionResponse,
} from "@/lib/api";
import { DIETA_ACTUAL, PORQUE_DEL_PLAN, PRESUPUESTOS, aguaDelDia } from "@/lib/nutricion";
import { programarComidas } from "@/lib/recordatorio";
import { fonts, radius, spacing, type as typeScale, type Palette } from "@/lib/theme";
import { actualizarComidaEnElReloj } from "@/lib/reloj-nativo";
import { formatMealItem, pickNextMeal, syncWidgetData } from "@/lib/widget";

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
  // Qué menús se cocinan esta semana y la lista de súper que les corresponde.
  // Viven aquí y no dentro del selector porque la lista de abajo también las
  // usa: cambiar de menú tiene que mover las dos cosas a la vez.
  const [preferencia, setPreferencia] = useState<MenuPreference>("AMBOS");
  const [groceriesLocal, setGroceriesLocal] = useState<GroceryItem[] | null>(null);
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
      setPreferencia(nutrition?.menuPreference ?? "AMBOS");
      // La lista recién llegada manda sobre cualquier recálculo anterior.
      setGroceriesLocal(null);

      // Nutrición es la única pantalla donde el usuario cambia un alimento
      // (swap) y la equivalencia queda guardada en el servidor: si no
      // avisamos aquí, el widget de iOS se queda con la comida vieja hasta
      // que el usuario abre Hoy. Igual que Hoy, tomamos el menú 1
      // (`menus[0]`) como el vigente del día — es el mismo criterio que ya
      // usa `index.tsx` para el widget, así ambas pantallas están de acuerdo
      // en cuál menú es "el de hoy". Mandamos SOLO los campos de comida:
      // racha/entreno son de Hoy, y como `undefined` no borra nada (ver el
      // contrato en `lib/widget.ts`), no se los pisamos desde aquí.
      try {
        const nextMeal = pickNextMeal(nutrition?.menus[0]?.meals ?? []);
        syncWidgetData({
          comidaLabel: nextMeal?.label ?? null,
          comidaHora: nextMeal?.timeHint ?? null,
          comidaItems: nextMeal ? nextMeal.items.slice(0, 3).map(formatMealItem) : null,
        });

        // El reloj recibe lo mismo, conservando lo que Hoy ya le dijo de
        // entrenamiento y racha (esta pantalla no sabe de eso).
        actualizarComidaEnElReloj({
          comida: nextMeal?.label ?? null,
          comidaHora: nextMeal?.timeHint ?? null,
          comidaItems: nextMeal ? nextMeal.items.slice(0, 3).map(formatMealItem) : null,
        });
      } catch {
        // Sincronizar el widget o el reloj nunca debe tumbar Nutrición.
      }

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

  /**
   * Los avisos por comida se programan con los horarios del menú vigente.
   *
   * Aquí y no en Hoy porque esta es la pantalla que ya tiene el menú completo
   * cargado; Hoy solo conoce la siguiente comida.
   */
  useEffect(() => {
    const comidas = data?.menus?.[0]?.meals ?? [];
    if (comidas.length === 0) return;
    void programarComidas(
      comidas.map((comida) => ({
        slot: comida.slot,
        label: comida.label,
        timeHint: comida.timeHint,
      })),
    );
  }, [data?.menus]);

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

  const { decision, menus } = data;
  // La lista de súper puede venir recalculada por el selector de menú sin
  // volver a pedir toda la pantalla: mientras eso pasa, manda la local.
  const groceries = groceriesLocal ?? data.groceries;
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

      {menus.length > 1 && (
        <SelectorDeMenu
          preferencia={preferencia}
          onCambio={(nueva, nuevasCompras) => {
            setPreferencia(nueva);
            setGroceriesLocal(nuevasCompras);
          }}
        />
      )}

      {menus
        .filter(
          (menu) =>
            preferencia === "AMBOS" ||
            (preferencia === "MENU_1" && menu.menuNumber === 1) ||
            (preferencia === "MENU_2" && menu.menuNumber === 2),
        )
        .map((menu) => (
          <MenuCard key={menu.menuNumber} menu={menu} onSwapped={load} />
        ))}

      <ScoreCard
        icon={ShoppingBasket}
        tint={colors.paloRosa}
        title="Lista de súper"
        summary={
          groceries.length === 0
            ? "Se arma sola con tus menús"
            : `${groceries.length} ${groceries.length === 1 ? "artículo" : "artículos"} para ${
                preferencia === "AMBOS" ? "la semana con los dos menús" : "la semana completa"
              }`
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

/**
 * "¿Cuál de los dos menús cocino esta semana?"
 *
 * LA CONFUSIÓN que resuelve: la pantalla enseñaba dos menús sin decir qué
 * eran, y la lectura natural —"¿es uno por semana? ¿son dos semanas?"— estaba
 * mal. Son dos variantes de LA MISMA semana: mismos macros, distintos
 * alimentos, para no comer lo mismo siete días. Aquí se dice con todas sus
 * letras y se puede elegir cocinar uno solo.
 *
 * Elegir cambia la lista de súper, que es lo que de verdad duele: comprar los
 * ingredientes de un menú que no vas a cocinar es tirar comida. Un menú solo
 * se come los 7 días, así que su lista trae el doble de cada cosa.
 */
function SelectorDeMenu({
  preferencia,
  onCambio,
}: {
  preferencia: MenuPreference;
  onCambio: (nueva: MenuPreference, groceries: GroceryItem[]) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [guardando, setGuardando] = useState<MenuPreference | null>(null);
  const [error, setError] = useState<string | null>(null);

  const OPCIONES: Array<{ valor: MenuPreference; nombre: string; detalle: string }> = [
    {
      valor: "AMBOS",
      nombre: "Los dos",
      detalle: "Alternas: cada menú cubre media semana. Compras para ambos.",
    },
    {
      valor: "MENU_1",
      nombre: "Solo el 1",
      detalle: "Lo comes los 7 días. La lista trae solo sus ingredientes.",
    },
    {
      valor: "MENU_2",
      nombre: "Solo el 2",
      detalle: "Lo comes los 7 días. La lista trae solo sus ingredientes.",
    },
  ];

  async function elegir(valor: MenuPreference) {
    if (guardando || valor === preferencia) return;
    setError(null);
    setGuardando(valor);
    try {
      const respuesta = await putMenuPreferido(valor);
      onCambio(respuesta.menuPreference, respuesta.groceries);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar tu elección");
    } finally {
      setGuardando(null);
    }
  }

  return (
    <Card>
      <SectionLabel>Tus dos menús</SectionLabel>
      <Text style={styles.parrafo}>
        No son dos semanas: son dos formas de comer LA MISMA semana, con los mismos macros y
        distintos alimentos, para que no acabes comiendo lo mismo siete días. Si prefieres cocinar
        uno solo, dilo aquí y tu lista de súper deja de traer lo del otro.
      </Text>

      <View style={styles.selectorLista}>
        {OPCIONES.map((opcion) => {
          const activa = preferencia === opcion.valor;
          return (
            <Pressable
              key={opcion.valor}
              onPress={() => elegir(opcion.valor)}
              disabled={guardando !== null}
              style={[styles.selectorFila, activa && styles.selectorFilaOn]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.selectorNombre, activa && styles.selectorNombreOn]}>
                  {opcion.nombre}
                </Text>
                <Text style={styles.selectorDetalle}>{opcion.detalle}</Text>
              </View>
              {guardando === opcion.valor && (
                <ActivityIndicator size="small" color={colors.champan} />
              )}
            </Pressable>
          );
        })}
      </View>

      {error && <Text style={styles.equivalenciaError}>{error}</Text>}
    </Card>
  );
}

function MenuCard({ menu, onSwapped }: { menu: Menu; onSwapped: () => Promise<void> }) {
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
        <ComidaDelMenu
          key={meal.slot}
          meal={meal}
          menuNumber={menu.menuNumber}
          onSwapped={onSwapped}
        />
      ))}
    </ScoreCard>
  );
}

/**
 * Una comida del menú: la lista limpia, y la equivalencia solo si se pide.
 *
 * Antes cada comida traía debajo el párrafo completo de equivalencias de todos
 * sus ingredientes, así que abrir un menú era encontrarse un muro de texto que
 * había que saltar para leer qué se come. Ahora el menú se abre limpio y cada
 * ingrediente que tiene cambio lo dice con un toque.
 *
 * La cantidad se lee primero en la unidad en que se sirve —"3 tortillas"— y
 * los gramos van al lado, más chicos: siguen siendo la cifra exacta, pero ya
 * no son lo primero que hay que interpretar.
 *
 * Elegir una opción YA NO es de lectura: cada opción es un botón que llama
 * `POST /nutricion/swap`, y al guardar se refresca el menú del padre
 * (`onSwapped`, que en la pantalla es el mismo `load()` de siempre) — así el
 * cambio se ve aquí, en el widget y en cualquier vista que lea `getNutrition`
 * sin trabajo extra. Si el servidor rechaza el cambio, no se toca el estado
 * local: no hay nada que revertir porque nunca se aplicó de más.
 */
function ComidaDelMenu({
  meal,
  menuNumber,
  onSwapped,
}: {
  meal: MenuMeal;
  menuNumber: number;
  onSwapped: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [errorCambio, setErrorCambio] = useState<string | null>(null);

  const equivalenciaDe = (nombre: string) =>
    meal.equivalences.find((equivalencia) => equivalencia.forName === nombre) ?? null;

  async function cambiar(forName: string, toName: string) {
    if (cambiando) return;
    setErrorCambio(null);
    setCambiando(toName);
    try {
      await postSwap({ menuNumber, slot: meal.slot, forName, toName });
      await onSwapped();
      setAbierto(null);
    } catch (error) {
      setErrorCambio(error instanceof ApiError ? error.message : "No se pudo hacer el cambio");
    } finally {
      setCambiando(null);
    }
  }

  return (
    <View style={styles.meal}>
      <Text style={styles.mealLabel}>
        {meal.label} · {meal.timeHint}
      </Text>

      {meal.items.map((item) => {
        const equivalencia = equivalenciaDe(item.name);
        const expandido = abierto === item.name;

        return (
          <View key={item.name}>
            <Pressable
              onPress={() => {
                if (!equivalencia) return;
                setErrorCambio(null);
                setAbierto(expandido ? null : item.name);
              }}
              disabled={!equivalencia}
              style={styles.itemFila}
            >
              <Text style={styles.item}>
                {item.name}
                {item.free ? " · libre" : ""}
              </Text>

              <View style={styles.itemCantidad}>
                {item.portion ? (
                  <Text style={styles.itemPorcion}>{item.portion}</Text>
                ) : !item.free ? (
                  <Text style={styles.itemPorcion}>{item.grams} g</Text>
                ) : null}
                {item.portion && !item.free ? (
                  <Text style={styles.itemGramos}>{item.grams} g</Text>
                ) : null}
              </View>

              {equivalencia ? (
                <Text style={styles.itemCambio}>{expandido ? "−" : "cambiar"}</Text>
              ) : null}
            </Pressable>

            {expandido && equivalencia && (
              <View style={styles.equivalenciaWrap}>
                <Text style={styles.equivalenciaAviso}>
                  {equivalencia.aproximada
                    ? // El motor a veces no encuentra ninguna opción dentro del ±10% de
                      // macro del alimento original; en vez de dejar al usuario sin
                      // cambio, ofrece la más parecida de su catálogo. Se lo decimos
                      // para que no espere que los números cuadren exacto.
                      "Cambio aproximado: los macros no quedan idénticos, pero es lo más cercano de tu catálogo. Se queda guardado."
                    : "El cambio se queda: tu menú, tu widget y tu día lo muestran así."}
                </Text>
                {/* Lista desplazable y no una fila de botones: con veinte
                    opciones, envolverlas en pastillas convertía el panel en un
                    muro que empujaba el resto del menú fuera de la pantalla.
                    Una por renglón se lee de corrido y se toca sin apuntar. */}
                <ScrollView
                  style={styles.equivalenciaLista}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  {equivalencia.options.map((opcion) => {
                    const aplicando = cambiando === opcion.name;
                    return (
                      <Pressable
                        key={opcion.name}
                        onPress={() => cambiar(equivalencia.forName, opcion.name)}
                        disabled={cambiando !== null}
                        style={[styles.equivalenciaOpcion, aplicando && styles.equivalenciaOpcionOn]}
                      >
                        <Text style={styles.equivalenciaOpcionTexto} numberOfLines={2}>
                          {opcion.portion ?? `${opcion.name} (${opcion.grams} g)`}
                        </Text>
                        {aplicando ? (
                          <ActivityIndicator size="small" color={colors.champan} />
                        ) : opcion.aproximada ? (
                          // Una sola marca por renglón: la persona ve de un
                          // vistazo cuáles cuadran exacto y cuáles se acercan.
                          <Text style={styles.equivalenciaAprox}>aprox.</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
                {errorCambio && <Text style={styles.equivalenciaError}>{errorCambio}</Text>}
              </View>
            )}
          </View>
        );
      })}
    </View>
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
    borderWidth: 1,
    borderColor: colors.guindaLight,
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
    // El nombre de la comida encabeza su bloque: sube de `bodySm` a
    // `subheading` para que se distinga de sus ingredientes.
    ...typeScale.subheading,
    color: colors.champan,
    marginBottom: spacing.xs,
  },
  itemFila: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    paddingVertical: 5,
  },
  item: {
    flex: 1,
    fontFamily: fonts.sans,
    ...typeScale.body,
    color: colors.marfil,
  },
  itemCantidad: { alignItems: "flex-end" },
  itemPorcion: {
    fontFamily: fonts.sansSemiBold,
    ...typeScale.body,
    color: colors.marfil,
    fontVariant: ["tabular-nums"],
  },
  // Los gramos no desaparecen: quedan debajo, más chicos. Siguen siendo la
  // cifra exacta, pero ya no son lo primero que hay que interpretar.
  itemGramos: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.paloRosa,
    fontVariant: ["tabular-nums"],
  },
  itemCambio: {
    fontFamily: fonts.sansMedium,
    ...typeScale.bodySm,
    color: colors.champan,
    width: 62,
    textAlign: "right",
  },
  equivalenciaWrap: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingLeft: spacing.sm,
  },
  equivalenciaAviso: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.paloRosa,
  },
  // Tope de alto para que el desplegable no empuje el resto del menú fuera
  // de la pantalla: se ven ~5 opciones y las demás se deslizan.
  equivalenciaLista: {
    maxHeight: 260,
    marginTop: spacing.sm,
  },
  equivalenciaOpcion: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBg,
    minHeight: 44,
  },
  equivalenciaAprox: {
    fontFamily: fonts.sans,
    ...typeScale.label,
    color: colors.paloRosa,
  },
  equivalenciaOpcionOn: {
    backgroundColor: colors.guinda,
    borderColor: colors.guindaLight,
  },
  equivalenciaOpcionTexto: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    ...typeScale.bodySm,
    color: colors.marfil,
  },
  selectorLista: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  selectorFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBg,
  },
  selectorFilaOn: {
    backgroundColor: colors.guinda,
    borderColor: colors.guindaLight,
  },
  selectorNombre: {
    fontFamily: fonts.sansMedium,
    ...typeScale.bodySm,
    color: colors.marfil,
  },
  selectorNombreOn: {
    color: colors.pergamino,
  },
  selectorDetalle: {
    fontFamily: fonts.sans,
    ...typeScale.label,
    color: colors.pergaminoSoft,
    marginTop: 2,
  },
  equivalenciaError: {
    fontFamily: fonts.sans,
    ...typeScale.bodySm,
    color: colors.error,
  },
});
