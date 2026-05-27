import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Text,
} from "@react-email/components";

type Props = {
  name?: string;
  device: string;
  ipAddress: string;
  loginAt: string;
  securityUrl: string;
};

export function SecurityAlertEmail({
  name,
  device,
  ipAddress,
  loginAt,
  securityUrl,
}: Props) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#fff" }}>
        <Container
          style={{ maxWidth: "560px", margin: "0 auto", padding: "40px 0" }}
        >
          <Text style={{ fontSize: "24px", fontWeight: "bold" }}>
            New sign-in to your account
          </Text>
          <Text>Hi {name ?? "there"},</Text>
          <Text>
            We noticed a sign-in to your account from a device or location we
            haven&apos;t seen before.
          </Text>
          <Hr style={{ borderColor: "#eee" }} />
          <Text style={{ margin: "8px 0" }}>
            <strong>Device:</strong> {device}
          </Text>
          <Text style={{ margin: "8px 0" }}>
            <strong>IP address:</strong> {ipAddress}
          </Text>
          <Text style={{ margin: "8px 0" }}>
            <strong>Time:</strong> {loginAt}
          </Text>
          <Hr style={{ borderColor: "#eee" }} />
          <Text>
            If this was you, no action is needed. If you don&apos;t recognize
            this activity, change your password and review your active sessions
            now.
          </Text>
          <Button
            href={securityUrl}
            style={{
              backgroundColor: "#6366f1",
              color: "#fff",
              padding: "12px 24px",
              borderRadius: "6px",
              textDecoration: "none",
            }}
          >
            Review activity
          </Button>
          <Text style={{ color: "#888", fontSize: "12px", marginTop: "24px" }}>
            You can disable these alerts from your account settings.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
