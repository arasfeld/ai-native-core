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

export function RegisterForm() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!name || !email || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authClient.signUp.email({ name, email, password });
      if (res.error) {
        setError(res.error.message ?? "Sign up failed");
        return;
      }
      router.replace("/verify-email");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign up failed");
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
      <Heading level={1}>Create account</Heading>
      <Text tone="muted">Get started in under a minute</Text>

      <View className="gap-3 pt-4">
        <TextField isInvalid={!!error}>
          <TextField.Input
            placeholder="Name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
          />
        </TextField>
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
            autoComplete="password-new"
          />
        </TextField>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button
          onPress={onSubmit}
          isDisabled={submitting || !name || !email || !password}
          isLoading={submitting}
        >
          Create account
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

      <View className="flex-row justify-center pt-4">
        <Pressable onPress={() => router.replace("/login")}>
          <Text tone="primary">Already have an account? Sign in</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
