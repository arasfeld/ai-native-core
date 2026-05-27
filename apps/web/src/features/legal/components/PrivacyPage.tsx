import { LegalLayout } from "./LegalLayout";

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="May 27, 2026">
      <p>
        This Privacy Policy explains what data AI Native Core (the
        &ldquo;Service&rdquo;) collects, how we use it, who we share it with,
        and the rights you have over it. It applies to the website, the chat UI,
        and the public API.
      </p>

      <h2>1. Data we collect</h2>
      <ul>
        <li>
          <strong>Account data</strong> — name, email, hashed password,
          authentication identifiers from Google/GitHub if you sign in via
          OAuth, and 2FA secrets if enabled.
        </li>
        <li>
          <strong>Chat content</strong> — the messages you and the AI exchange,
          attached images, audio you submit for transcription, and uploaded
          documents you choose to ingest.
        </li>
        <li>
          <strong>Usage data</strong> — token counts, session and request
          metadata, model and provider used, and feature flags.
        </li>
        <li>
          <strong>Device and network data</strong> — IP address, browser or
          device identifiers, timestamps, and approximate location when you opt
          in to location-aware features.
        </li>
        <li>
          <strong>Billing data</strong> — handled by Stripe; we store the Stripe
          customer ID and a redacted subscription summary, not your card number.
        </li>
        <li>
          <strong>Product analytics</strong> — anonymized events captured by
          PostHog and crash/performance traces captured by Sentry, when those
          integrations are enabled.
        </li>
      </ul>

      <h2>2. How we use data</h2>
      <ul>
        <li>To provide the Service, including generating AI responses.</li>
        <li>
          To enforce rate limits, monthly token budgets, and to detect abuse.
        </li>
        <li>To send transactional email (verification, billing, alerts).</li>
        <li>
          To debug issues and improve product reliability, performance, and
          quality.
        </li>
        <li>To comply with legal obligations.</li>
      </ul>

      <h2>3. Model training</h2>
      <p>
        We do <strong>not</strong> use your Inputs or Outputs to train
        general-purpose models. We may use aggregated, de-identified usage data
        to improve evaluation suites and prompts. Third-party model providers
        you select (e.g., OpenAI, Anthropic) have their own policies; please
        review them directly.
      </p>

      <h2>4. Sub-processors</h2>
      <p>
        We share data with the following providers strictly as needed to operate
        the Service:
      </p>
      <ul>
        <li>Stripe — payment processing</li>
        <li>Resend — transactional email</li>
        <li>OpenAI / Anthropic / OpenRouter — model inference</li>
        <li>PostHog — product analytics (when enabled)</li>
        <li>Sentry — error and performance tracking (when enabled)</li>
        <li>Cloud hosting providers — server and database hosting</li>
      </ul>

      <h2>5. Retention</h2>
      <p>
        We retain account and chat data for as long as your account is active.
        You can delete individual conversations at any time from the sidebar.
        Deleting your account removes your personal data within 30 days, except
        where we are required by law to retain it (for example, invoices for tax
        purposes).
      </p>

      <h2>6. Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access, correct,
        export, or delete personal data we hold about you, to object to or
        restrict certain processing, and to withdraw consent. You can exercise
        most of these rights directly from the profile page, or by emailing{" "}
        <a href="mailto:privacy@example.com">privacy@example.com</a>.
      </p>

      <h2>7. Security</h2>
      <p>
        We use encryption in transit, hashed passwords, role-based access
        control, audit logging of admin actions, and isolated tenant scoping in
        the database. No system is perfectly secure; please report suspected
        vulnerabilities to{" "}
        <a href="mailto:security@example.com">security@example.com</a>.
      </p>

      <h2>8. Children</h2>
      <p>
        The Service is not directed to children under 13 (or under 16 in the
        EEA/UK). If you believe a child has provided us personal data, please
        contact us and we will delete it.
      </p>

      <h2>9. International transfers</h2>
      <p>
        Your data may be processed in countries other than the one in which you
        live. Where required, we rely on standard contractual clauses or
        equivalent safeguards for cross-border transfers.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. Material changes will be
        announced via email or in-product notice at least 14 days before they
        take effect.
      </p>

      <h2>11. Contact</h2>
      <p>
        For privacy questions, email{" "}
        <a href="mailto:privacy@example.com">privacy@example.com</a>.
      </p>

      <p className="text-muted-foreground text-sm">
        This document is a template provided with the AI Native Core starter and
        should be reviewed by qualified legal counsel before use in production.
      </p>
    </LegalLayout>
  );
}
