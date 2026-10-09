import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { FullLogo } from "../components/brand.tsx";
import { Button, Card, Field, Notice, s } from "../components/ui.tsx";
import { errorMessage } from "../lib/api.ts";
import { useSession } from "../lib/session.tsx";

export function LoginScreen() {
  const { login } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <ScrollView
      contentContainerStyle={[s.screen, { flexGrow: 1, justifyContent: "center" }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ alignItems: "center", marginBottom: 24 }}>
        <FullLogo height={72} />
      </View>
      <Card>
        <Text style={s.h2}>Entrar</Text>
        {error ? <Notice kind="danger" text={error} /> : null}
        <Field
          label="E-mail"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
        <Field
          label="Senha"
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
        />
        <Button
          label={busy ? "Entrando…" : "Entrar"}
          disabled={busy || !email || !password}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              await login(email.trim(), password);
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
              setPassword("");
            }
          }}
        />
      </Card>
    </ScrollView>
  );
}
