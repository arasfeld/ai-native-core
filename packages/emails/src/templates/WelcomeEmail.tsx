import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Text,
} from "@react-email/components";

type Props = { name?: string; appUrl: string };

export function WelcomeEmail({ name, appUrl }: Props) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#fff" }}>
        <Container
          style={{ maxWidth: "560px", margin: "0 auto", padding: "40px 0" }}
        >
          <Text style={{ fontSize: "24px", fontWeight: "bold" }}>Welcome!</Text>
          <Text>Hi {name ?? "there"},</Text>
          <Text>Your account is ready. Start chatting right away.</Text>
          <Button
            href={appUrl}
            style={{
              backgroundColor: "#6366f1",
              color: "#fff",
              padding: "12px 24px",
              borderRadius: "6px",
              textDecoration: "none",
            }}
          >
            Open App
          </Button>
          <Text style={{ color: "#888", fontSize: "12px" }}>
            If you didn&apos;t create an account, you can ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
