import { LegalLayout } from "./LegalLayout";

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="May 27, 2026">
      <p>
        Welcome to AI Native Core (the &ldquo;Service&rdquo;). By accessing or
        using the Service you agree to be bound by these Terms of Service
        (&ldquo;Terms&rdquo;). If you do not agree, do not use the Service.
      </p>

      <h2>1. Accounts</h2>
      <p>
        You may use the Service as a guest within published rate and token
        limits, or by creating an account. You are responsible for safeguarding
        your credentials and for all activity that occurs under your account.
        You must provide accurate information and promptly update it if it
        changes.
      </p>

      <h2>2. Acceptable use</h2>
      <p>You agree not to misuse the Service. In particular, you will not:</p>
      <ul>
        <li>Use the Service to violate any law or third-party right.</li>
        <li>
          Attempt to disrupt the Service, bypass quotas, or probe for
          vulnerabilities outside of an authorized security disclosure.
        </li>
        <li>
          Use outputs to develop a competing model, or to generate content that
          is harmful, deceptive, infringing, or unlawful.
        </li>
        <li>
          Submit personal data of others without a lawful basis, or content you
          do not have the right to submit.
        </li>
      </ul>

      <h2>3. AI-generated content</h2>
      <p>
        The Service uses large language models and other AI systems. Outputs may
        be inaccurate, incomplete, or offensive, and may not reflect the views
        of the Service operator. You are responsible for evaluating outputs
        before relying on them. Do not use the Service for advice that requires
        a licensed professional.
      </p>

      <h2>4. Your content</h2>
      <p>
        You retain ownership of the inputs you submit (&ldquo;Inputs&rdquo;).
        You grant us a non-exclusive, worldwide, royalty-free license to process
        Inputs solely to operate and improve the Service. We do not claim
        ownership of outputs generated for you (&ldquo;Outputs&rdquo;), but
        similar outputs may be produced for other users.
      </p>

      <h2>5. Paid plans and billing</h2>
      <p>
        Paid plans renew on the cadence shown at checkout. Fees are charged in
        advance and are non-refundable except where required by law. You may
        cancel at any time from the billing page; cancellation takes effect at
        the end of the current billing period. We may change prices with at
        least 30 days&rsquo; notice before your next renewal.
      </p>

      <h2>6. Rate limits and usage caps</h2>
      <p>
        The Service enforces rate limits and monthly token budgets. We may
        adjust limits to protect the Service or prevent abuse. Exceeding limits
        may result in throttling or temporary suspension.
      </p>

      <h2>7. Termination</h2>
      <p>
        You may stop using the Service at any time and delete your account from
        the profile page. We may suspend or terminate access if you breach these
        Terms or to comply with law. On termination, your right to use the
        Service ends, and we may delete associated data after a reasonable
        retention period.
      </p>

      <h2>8. Disclaimer</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as
        available&rdquo;. To the maximum extent permitted by law, we disclaim
        all warranties, express or implied, including merchantability, fitness
        for a particular purpose, and non-infringement.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, our aggregate liability arising
        out of or relating to the Service will not exceed the greater of (a) the
        amount you paid us in the twelve months before the claim, or (b) US
        $100. We will not be liable for indirect, incidental, special, or
        consequential damages.
      </p>

      <h2>10. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes will be
        announced via email or in-product notice at least 14 days before they
        take effect. Continued use after the effective date constitutes
        acceptance of the updated Terms.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about these Terms can be sent to{" "}
        <a href="mailto:legal@example.com">legal@example.com</a>.
      </p>

      <p className="text-muted-foreground text-sm">
        This document is a template provided with the AI Native Core starter and
        should be reviewed by qualified legal counsel before use in production.
      </p>
    </LegalLayout>
  );
}
