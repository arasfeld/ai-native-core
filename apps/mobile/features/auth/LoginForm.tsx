import {
  Button,
  Divider,
  FieldError,
  Heading,
  Screen,
  Text,
  TextField,
  useToast,
} from "@repo/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authClient.signIn.email({ email, password });
      if (res.error) {
        setError(res.error.message ?? "Sign in failed");
        return;
      }
      const data = res.data as { twoFactorRedirect?: boolean } | null;
      if (data?.twoFactorRedirect) {
        router.push("/two-factor");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  };

  const onOAuth = async (provider: "google" | "github") => {
    setSubmitting(true);
    try {
      await authClient.signIn.social({ provider, callbackURL: "/" });
    } catch (e) {
      toast.error("OAuth failed", e instanceof Error ? e.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll contentContainerClassName="px-6 pt-safe-offset-8 pb-8 gap-4">
      <Heading level={1}>Welcome back</Heading>
      <Text tone="muted">Sign in to continue</Text>

      <View className="gap-3 pt-4">
        <TextField isInvalid={!!error}>
          <TextField.Input
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        </TextField>
        <TextField isInvalid={!!error}>
          <TextField.Input
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />
        </TextField>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button
          onPress={onSubmit}
          isDisabled={submitting || !email || !password}
          isLoading={submitting}
        >
          Sign in
        </Button>
      </View>

      <View className="flex-row items-center gap-3 pt-4">
        <Divider className="flex-1" />
        <Text size="xs" tone="muted">
          or
        </Text>
        <Divider className="flex-1" />
      </View>

      <View className="gap-2">
        <Button variant="outline" onPress={() => onOAuth("google")}>
          Continue with Google
        </Button>
        <Button variant="outline" onPress={() => onOAuth("github")}>
          Continue with GitHub
        </Button>
      </View>

      <View className="flex-row justify-between pt-4">
        <Pressable onPress={() => router.push("/forgot-password")}>
          <Text tone="primary">Forgot password?</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/register")}>
          <Text tone="primary">Create account</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
