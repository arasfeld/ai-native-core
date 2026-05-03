import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Text,
} from "@react-email/components";

type Props = {
  percent: 80 | 100;
  used: number;
  limit: number;
  upgradeUrl: string;
};

export function BudgetWarningEmail({
  percent,
  used,
  limit,
  upgradeUrl,
}: Props) {
  const isExhausted = percent === 100;
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#fff" }}>
        <Container
          style={{ maxWidth: "560px", margin: "0 auto", padding: "40px 0" }}
        >
          <Text style={{ fontSize: "24px", fontWeight: "bold" }}>
            {isExhausted ? "Token budget exhausted" : "Token budget at 80%"}
          </Text>
          <Text>
            You&apos;ve used {used.toLocaleString()} of {limit.toLocaleString()}{" "}
            tokens this month ({percent}%).
          </Text>
          <Text>
            {isExhausted
              ? "Your account is now rate-limited. Upgrade to continue chatting."
              : "You're approaching your monthly limit. Upgrade to avoid interruptions."}
          </Text>
          <Button
            href={upgradeUrl}
            style={{
              backgroundColor: "#6366f1",
              color: "#fff",
              padding: "12px 24px",
              borderRadius: "6px",
              textDecoration: "none",
            }}
          >
            Upgrade Plan
          </Button>
        </Container>
      </Body>
    </Html>
  );
}
