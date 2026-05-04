import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type Props = {
  orgName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
};

export function OrganizationInviteEmail({
  orgName,
  inviterName,
  role,
  acceptUrl,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>
        {inviterName} invited you to join {orgName}
      </Preview>
      <Body
        style={{
          fontFamily: "sans-serif",
          backgroundColor: "#f9fafb",
          padding: "40px 0",
        }}
      >
        <Container
          style={{
            backgroundColor: "#fff",
            borderRadius: 8,
            padding: "32px",
            maxWidth: 480,
          }}
        >
          <Heading style={{ fontSize: 22, marginBottom: 8 }}>
            You&apos;ve been invited to join {orgName}
          </Heading>
          <Text style={{ color: "#6b7280" }}>
            {inviterName} has invited you to join <strong>{orgName}</strong> as
            a <strong>{role}</strong>.
          </Text>
          <Section style={{ textAlign: "center", margin: "32px 0" }}>
            <Button
              href={acceptUrl}
              style={{
                backgroundColor: "#111827",
                color: "#fff",
                borderRadius: 6,
                padding: "12px 24px",
                fontWeight: 600,
              }}
            >
              Accept Invitation
            </Button>
          </Section>
          <Text style={{ color: "#9ca3af", fontSize: 13 }}>
            This invitation expires in 7 days. If you didn&apos;t expect this,
            you can ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
