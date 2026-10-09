import { useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, Field, Notice, s } from "../components/ui.tsx";
import { errorMessage } from "../lib/api.ts";
import { useSession } from "../lib/session.tsx";
import { color } from "../theme.ts";

export function LoginScreen() {
  const { login } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <View style={[s.screen, { justifyContent: "center" }]}>
      <Text style={{ fontSize: 36, fontWeight: "800", color: color.brandPrimary }}>rebania</Text>
      <Text style={[s.muted, { marginBottom: 24 }]}>Sua fazenda em dia.</Text>
      <Card>
        {error ? <Notice kind="danger" text={error} /> : null}
        <Field label="E-mail" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} />
        <Field label="Senha" secureTextEntry autoComplete="password" value={password} onChangeText={setPassword} />
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
    </View>
  );
}
