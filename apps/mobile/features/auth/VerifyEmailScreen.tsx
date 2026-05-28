import { Button, Heading, Screen, Text, useToast } from "@repo/ui-native";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";

export function VerifyEmailScreen() {
  const router = useRouter();
  const toast = useToast();
  const { data: session, refetch } = authClient.useSession();

  useEffect(() => {
    if (session?.user?.emailVerified) {
      router.replace("/");
    }
  }, [router, session?.user?.emailVerified]);

  useEffect(() => {
    const id = setInterval(() => {
      refetch();
    }, 5000);
    return () => clearInterval(id);
  }, [refetch]);

  const resend = async () => {
    const email = session?.user?.email;
    if (!email) return;
    try {
      await authClient.sendVerificationEmail({ email });
      toast.success("Verification email sent");
    } catch (e) {
      toast.error("Failed to send", e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <Screen scroll contentContainerClassName="px-6 pt-safe-offset-8 pb-8 gap-4">
      <Heading level={1}>Check your inbox</Heading>
      <Text>
        We sent a verification link to{" "}
        <Text weight="semibold">{session?.user?.email}</Text>. Tap the link to
        finish setting up your account.
      </Text>
      <Button variant="outline" onPress={resend}>
        Resend email
      </Button>
      <Button variant="ghost" onPress={() => authClient.signOut()}>
        Sign out
      </Button>
    </Screen>
  );
}
