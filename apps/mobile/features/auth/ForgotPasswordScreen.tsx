import { env } from "@repo/env/native";
import {
  Button,
  FieldError,
  Heading,
  Screen,
  Text,
  TextField,
} from "@repo/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable } from "react-native";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onSubmit = async () => {
    if (!email) return;
    setSubmitting(true);
    setError(null);
    try {
      await (
        authClient as unknown as {
          $fetch: (
            path: string,
            opts: { method: string; body: unknown },
          ) => Promise<unknown>;
        }
      ).$fetch("/request-password-reset", {
        method: "POST",
        body: {
          email,
          redirectTo: `${env.EXPO_PUBLIC_SERVER_URL}/reset-password`,
        },
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <Screen
        scroll
        contentContainerClassName="px-6 pt-safe-offset-8 pb-8 gap-4"
      >
        <Heading level={1}>Check your inbox</Heading>
        <Text>
          If an account exists for <Text weight="semibold">{email}</Text>, we
          just sent a password reset link.
        </Text>
        <Button onPress={() => router.replace("/login")}>
          Back to sign in
        </Button>
      </Screen>
    );
  }

  return (
    <Screen scroll contentContainerClassName="px-6 pt-safe-offset-8 pb-8 gap-4">
      <Heading level={1}>Reset password</Heading>
      <Text>
        Enter the email for your account and we'll send you a reset link.
      </Text>
      <TextField isInvalid={!!error}>
        <TextField.Input
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          autoFocus
        />
      </TextField>
      {error ? <FieldError>{error}</FieldError> : null}
      <Button
        onPress={onSubmit}
        isDisabled={!email || submitting}
        isLoading={submitting}
      >
        Send reset link
      </Button>
      <Pressable onPress={() => router.replace("/login")}>
        <Text tone="primary">Back to sign in</Text>
      </Pressable>
    </Screen>
  );
}
