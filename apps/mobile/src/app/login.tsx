import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Wordmark } from "@/components/Wordmark";
import { supabase } from "@/lib/supabase";
import { colors, fonts, spacing } from "@/lib/theme";

/**
 * Login con email/contraseña. Sin registro: las cuentas las crea el sistema
 * (coach/admin), la atleta solo entra con lo que ya le dieron de alta.
 */
export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError("Escribe tu correo y contraseña");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(mapAuthError(signInError.message));
    }
    // Si no hay error, onAuthStateChange actualiza la sesión y el guard de
    // _layout.tsx redirige solo a (tabs).
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={styles.flex}>
        <View style={styles.container}>
          <View style={styles.hero}>
            <Wordmark size="lg" />
          </View>

          <Card style={styles.card}>
            <View style={styles.field}>
              <Text style={styles.label}>CORREO</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="tu@correo.com"
                placeholderTextColor={colors.paloRosaLight}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>CONTRASEÑA</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.paloRosaLight}
                secureTextEntry
                style={styles.input}
              />
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <PrimaryButton label="Entrar" onPress={handleLogin} loading={loading} />
          </Card>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

/** Traduce los mensajes de Supabase a algo que la atleta entienda. */
function mapAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "Correo o contraseña incorrectos";
  }
  if (normalized.includes("network") || normalized.includes("fetch")) {
    return "Sin conexión. Revisa tu internet e intenta de nuevo";
  }
  return "No se pudo iniciar sesión. Intenta de nuevo";
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
    gap: spacing.xxxl,
  },
  hero: {
    alignItems: "center",
  },
  card: {
    gap: spacing.lg,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    fontFamily: fonts.display,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.paloRosa,
  },
  input: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.marfil,
  },
  error: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.error,
    textAlign: "center",
  },
});
