import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Text,
} from "@react-email/components";

type Props = { url: string };

export function PasswordResetEmail({ url }: Props) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#fff" }}>
        <Container
          style={{ maxWidth: "560px", margin: "0 auto", padding: "40px 0" }}
        >
          <Text style={{ fontSize: "24px", fontWeight: "bold" }}>
            Reset your password
          </Text>
          <Text>
            Click the button below to reset your password. This link expires in
            1 hour.
          </Text>
          <Button
            href={url}
            style={{
              backgroundColor: "#6366f1",
              color: "#fff",
              padding: "12px 24px",
              borderRadius: "6px",
              textDecoration: "none",
            }}
          >
            Reset Password
          </Button>
          <Text style={{ color: "#888", fontSize: "12px" }}>
            If you didn&apos;t request this, you can ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
