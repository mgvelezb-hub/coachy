import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ChevronLeft, Lock, ScanFace } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SectionLabel } from "@/components/SectionLabel";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { useTheme } from "@/context/theme";
import { ApiError, PHOTO_VIEW_LABEL, getPhotos, type ProgressPhoto } from "@/lib/api";
import {
  MAX_PIN_LENGTH,
  MIN_PIN_LENGTH,
  biometricsEnabled,
  hasPin,
  promptBiometrics,
  verifyPin,
} from "@/lib/vault";
import { fonts, radius, spacing, type as typeScale, type Palette } from "@/lib/theme";

/**
 * La bóveda: el único lugar donde se ven las fotos de progreso.
 *
 * Están escondidas del resto de la app a propósito —no aparecen en Resumen ni
 * en el historial— y aquí se pide una clave del teléfono antes de pintarlas.
 * La clave la valida `lib/vault.ts` contra un hash guardado en el Keychain;
 * el servidor no la conoce ni la necesita: es una cerradura contra el vistazo
 * ajeno, no una segunda sesión.
 *
 * Las fotos no se cachean en disco: se piden con URL firmada cada vez que se
 * abre la bóveda, y esas URLs caducan. Guardar copias locales sería
 * reintroducir por la puerta de atrás justo lo que esta pantalla evita.
 */

type Estado = "verificando" | "bloqueada" | "abierta" | "sin_clave";

export default function FotosScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();

  const [estado, setEstado] = useState<Estado>("verificando");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [fotos, setFotos] = useState<ProgressPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abrir = useCallback(async () => {
    setEstado("abierta");
    try {
      const { fotos: lista } = await getPhotos();
      setFotos(lista);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudieron cargar tus fotos");
    }
  }, []);

  // Al entrar: si no hay clave configurada se dice y no se enseña nada; si hay
  // y la biometría está prendida, se ofrece la cara antes que el teclado.
  useEffect(() => {
    void (async () => {
      if (!(await hasPin())) {
        setEstado("sin_clave");
        return;
      }
      if (await biometricsEnabled()) {
        if (await promptBiometrics()) {
          await abrir();
          return;
        }
      }
      setEstado("bloqueada");
    })();
  }, [abrir]);

  async function intentarPin() {
    if (await verifyPin(pin)) {
      setPin("");
      setPinError(null);
      await abrir();
      return;
    }
    setPin("");
    setPinError("Esa no es tu clave.");
  }

  const columnas = width >= 500 ? 3 : 2;
  const ancho = (width - spacing.lg * 2 - spacing.md * (columnas - 1)) / columnas;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <ChevronLeft size={22} color={colors.paloRosa} strokeWidth={2} />
          <Text style={styles.backText}>Atrás</Text>
        </Pressable>

        <Text style={styles.title}>Tus fotos</Text>

        {estado === "verificando" && <LoadingState label="Abriendo tu bóveda..." />}

        {estado === "sin_clave" && (
          <Card>
            <SectionLabel>Sin clave todavía</SectionLabel>
            <EmptyState message="Para ver tus fotos aquí, primero crea una clave en Ajustes. Es distinta a la de tu teléfono a propósito: quien ya desbloqueó tu celular no debería poder abrirlas." />
            <PrimaryButton label="Ir a Ajustes" onPress={() => router.replace("/ajustes/fotos")} />
          </Card>
        )}

        {estado === "bloqueada" && (
          <Card>
            <View style={styles.lockHeader}>
              <Lock size={22} color={colors.champan} strokeWidth={2} />
              <Text style={styles.lockTitle}>Escribe tu clave</Text>
            </View>

            <TextInput
              value={pin}
              onChangeText={(value) => setPin(value.replace(/\D/g, "").slice(0, MAX_PIN_LENGTH))}
              placeholder={"•".repeat(MIN_PIN_LENGTH)}
              placeholderTextColor={colors.paloRosaLight}
              keyboardType="number-pad"
              secureTextEntry
              style={styles.pinInput}
              autoFocus
            />

            {pinError && <Text style={styles.pinError}>{pinError}</Text>}

            <PrimaryButton
              label="Abrir"
              onPress={intentarPin}
              disabled={pin.length < MIN_PIN_LENGTH}
            />

            <Pressable
              onPress={async () => {
                if (await promptBiometrics()) await abrir();
              }}
              style={styles.biometria}
              hitSlop={8}
            >
              <ScanFace size={18} color={colors.paloRosa} strokeWidth={2} />
              <Text style={styles.biometriaText}>Usar Face ID o Touch ID</Text>
            </Pressable>
          </Card>
        )}

        {estado === "abierta" && (
          <>
            {error && <ErrorState message={error} onRetry={abrir} />}
            {!error && fotos === null && <LoadingState label="Cargando tus fotos..." />}
            {!error && fotos !== null && fotos.length === 0 && (
              <Card>
                <EmptyState message="Todavía no subes fotos de progreso. Se agregan en el check-in y son opcionales." />
              </Card>
            )}
            {!error && fotos !== null && fotos.length > 0 && (
              <View style={styles.galeria}>
                {fotos.map((foto) => (
                  <View key={foto.id} style={{ width: ancho }}>
                    {foto.url ? (
                      <Image
                        source={{ uri: foto.url }}
                        style={[styles.foto, { width: ancho, height: ancho * 1.35 }]}
                        contentFit="cover"
                        transition={150}
                      />
                    ) : (
                      <View style={[styles.foto, styles.fotoRota, { width: ancho, height: ancho * 1.35 }]}>
                        <Text style={styles.fotoRotaText}>Sin cargar</Text>
                      </View>
                    )}
                    <Text style={styles.fotoPie}>
                      {PHOTO_VIEW_LABEL[foto.view]} · {foto.date}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.obsidiana },
  content: { padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.lg },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: spacing.sm,
    alignSelf: "flex-start",
  },
  backText: { fontFamily: fonts.sansMedium, ...typeScale.body, color: colors.paloRosa },
  title: { fontFamily: fonts.sansBold, ...typeScale.title, color: colors.marfil },
  lockHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  lockTitle: { fontFamily: fonts.sansSemiBold, ...typeScale.heading, color: colors.marfil },
  pinInput: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBg,
    paddingVertical: spacing.lg,
    textAlign: "center",
    letterSpacing: 12,
    fontFamily: fonts.sansBold,
    ...typeScale.title,
    color: colors.marfil,
  },
  pinError: {
    fontFamily: fonts.sansMedium,
    ...typeScale.bodySm,
    color: colors.error,
    marginBottom: spacing.md,
  },
  biometria: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  biometriaText: { fontFamily: fonts.sansMedium, ...typeScale.body, color: colors.paloRosa },
  galeria: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  foto: { borderRadius: radius.xl, backgroundColor: colors.cardBg },
  fotoRota: { alignItems: "center", justifyContent: "center" },
  fotoRotaText: { fontFamily: fonts.sans, ...typeScale.bodySm, color: colors.paloRosaLight },
  fotoPie: {
    fontFamily: fonts.sansMedium,
    ...typeScale.bodySm,
    color: colors.paloRosa,
    marginTop: spacing.xs,
  },
});
