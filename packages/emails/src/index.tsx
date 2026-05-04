import { render } from "@react-email/render";
import { Resend } from "resend";
import { BudgetWarningEmail } from "./templates/BudgetWarningEmail";
import { OrganizationInviteEmail } from "./templates/OrganizationInviteEmail";
import { PasswordResetEmail } from "./templates/PasswordResetEmail";
import { WelcomeEmail } from "./templates/WelcomeEmail";

export {
  BudgetWarningEmail,
  OrganizationInviteEmail,
  PasswordResetEmail,
  WelcomeEmail,
};

function getResend(): Resend | null {
  return process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL;
  if (!resend || !from) return;
  await resend.emails.send({ from, to, subject, html });
}

export async function renderWelcomeEmail(props: {
  name?: string;
  appUrl: string;
}): Promise<string> {
  return render(<WelcomeEmail {...props} />);
}

export async function renderPasswordResetEmail(props: {
  url: string;
}): Promise<string> {
  return render(<PasswordResetEmail {...props} />);
}

export async function renderBudgetWarningEmail(props: {
  percent: 80 | 100;
  used: number;
  limit: number;
  upgradeUrl: string;
}): Promise<string> {
  return render(<BudgetWarningEmail {...props} />);
}

export async function renderOrgInviteEmail(props: {
  orgName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
}): Promise<string> {
  return render(<OrganizationInviteEmail {...props} />);
}
