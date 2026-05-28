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

type TwoFactorClient = {
  verifyTotp: (input: { code: string }) => Promise<{
    error?: { message?: string } | null;
  }>;
  verifyBackupCode: (input: { code: string }) => Promise<{
    error?: { message?: string } | null;
  }>;
};

export function TwoFactorScreen() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const twoFactor = (
        authClient as unknown as { twoFactor: TwoFactorClient }
      ).twoFactor;
      const res = useBackup
        ? await twoFactor.verifyBackupCode({ code })
        : await twoFactor.verifyTotp({ code });
      if (res.error) {
        setError(res.error.message ?? "Invalid code");
        return;
      }
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll contentContainerClassName="px-6 pt-safe-offset-8 pb-8 gap-4">
      <Heading level={1}>Two-factor authentication</Heading>
      <Text>
        Enter the {useBackup ? "backup" : "6-digit"} code from your
        authenticator app.
      </Text>
      <TextField isInvalid={!!error}>
        <TextField.Input
          placeholder={useBackup ? "Backup code" : "123 456"}
          value={code}
          onChangeText={setCode}
          keyboardType={useBackup ? "default" : "number-pad"}
          maxLength={useBackup ? undefined : 6}
          autoFocus
        />
      </TextField>
      {error ? <FieldError>{error}</FieldError> : null}
      <Button
        onPress={verify}
        isDisabled={!code || submitting}
        isLoading={submitting}
      >
        Verify
      </Button>
      <Pressable
        onPress={() => {
          setUseBackup((v) => !v);
          setCode("");
          setError(null);
        }}
      >
        <Text tone="primary">
          {useBackup
            ? "Use authenticator code instead"
            : "Use backup code instead"}
        </Text>
      </Pressable>
    </Screen>
  );
}
