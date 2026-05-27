"use client";

import {
  ArrowRightIcon,
  BotIcon,
  CheckIcon,
  MessageSquareIcon,
  SparklesIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const STEP_COUNT = 3;

const EXAMPLE_PROMPTS = [
  "Summarize the latest news on large language models.",
  "Help me draft a polite email declining a meeting.",
  "Explain how vector embeddings power semantic search.",
];

const PRO_PERKS = [
  "Higher monthly token budget for longer conversations",
  "Priority access to frontier models (Claude Opus, GPT-4o)",
  "Image generation, document RAG, and tool calling unlocked",
];

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);

  // If the user has already completed onboarding, skip the wizard.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/onboarding", {
          cache: "no-store",
        });
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { completedAt: string | null };
          if (data.completedAt) {
            router.replace("/chat");
            return;
          }
        }
      } catch {
        // Non-fatal — let the user proceed with the wizard.
      }
      if (!cancelled) setStatusLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function finish(destination: "/chat" | "/billing") {
    if (submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/auth/onboarding/complete", { method: "POST" });
    } catch {
      // Best-effort — never block the user from reaching the app.
    }
    router.push(destination);
  }

  if (!statusLoaded) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <BotIcon className="size-4 text-muted-foreground" />
          AI Native Core
        </div>
        <button
          type="button"
          onClick={() => finish("/chat")}
          disabled={submitting}
          className="text-muted-foreground text-sm hover:text-foreground disabled:opacity-50"
        >
          Skip for now
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl space-y-8">
          <StepIndicator current={step} />

          {step === 1 && (
            <WelcomeStep onContinue={() => setStep(2)} disabled={submitting} />
          )}
          {step === 2 && (
            <TryChatStep
              onContinue={() => setStep(3)}
              onBack={() => setStep(1)}
              disabled={submitting}
            />
          )}
          {step === 3 && (
            <UpgradeStep
              onMaybeLater={() => finish("/chat")}
              onUpgrade={() => finish("/billing")}
              onBack={() => setStep(2)}
              disabled={submitting}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: STEP_COUNT }, (_, i) => i + 1).map((n) => {
        const done = n < current;
        const active = n === current;
        return (
          <div key={n} className="flex items-center gap-2">
            <div
              className={`flex size-7 items-center justify-center rounded-full border text-xs ${
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : active
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground"
              }`}
            >
              {done ? <CheckIcon className="size-3.5" /> : n}
            </div>
            {n < STEP_COUNT && (
              <div
                className={`h-px w-8 ${done ? "bg-primary" : "bg-border"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function WelcomeStep({
  onContinue,
  disabled,
}: {
  onContinue: () => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-6 text-center">
      <div className="space-y-2">
        <SparklesIcon className="mx-auto size-8 text-primary" />
        <h1 className="font-semibold text-2xl">Welcome aboard</h1>
        <p className="text-muted-foreground text-sm">
          You're all set. Let's take a quick 30-second tour of what you can do.
        </p>
      </div>
      <div className="grid gap-3 text-left">
        <Bullet>Streaming chat with multi-modal input (text + images)</Bullet>
        <Bullet>
          Conversation history with full-text search, export, and per-chat
          instructions
        </Bullet>
        <Bullet>Personal API keys for programmatic access</Bullet>
      </div>
      <button
        type="button"
        onClick={onContinue}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
      >
        Continue
        <ArrowRightIcon className="size-4" />
      </button>
    </div>
  );
}

function TryChatStep({
  onContinue,
  onBack,
  disabled,
}: {
  onContinue: () => void;
  onBack: () => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-6 text-center">
      <div className="space-y-2">
        <MessageSquareIcon className="mx-auto size-8 text-primary" />
        <h1 className="font-semibold text-2xl">Try a prompt</h1>
        <p className="text-muted-foreground text-sm">
          Need inspiration? Here are a few prompts to get you started — you can
          copy one, or come up with your own.
        </p>
      </div>
      <ul className="space-y-2 text-left">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <li
            key={prompt}
            className="rounded-md border bg-card px-4 py-2.5 text-sm"
          >
            {prompt}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={disabled}
          className="rounded-md border px-4 py-2 font-medium text-sm hover:bg-accent disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
        >
          Continue
          <ArrowRightIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

function UpgradeStep({
  onMaybeLater,
  onUpgrade,
  onBack,
  disabled,
}: {
  onMaybeLater: () => void;
  onUpgrade: () => void;
  onBack: () => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-6 text-center">
      <div className="space-y-2">
        <SparklesIcon className="mx-auto size-8 text-primary" />
        <h1 className="font-semibold text-2xl">Unlock more with Pro</h1>
        <p className="text-muted-foreground text-sm">
          The free plan is generous, but Pro removes the cap so you can build
          and ship without thinking about it.
        </p>
      </div>
      <div className="grid gap-3 text-left">
        {PRO_PERKS.map((perk) => (
          <Bullet key={perk}>{perk}</Bullet>
        ))}
      </div>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={disabled}
          className="rounded-md border px-4 py-2 font-medium text-sm hover:bg-accent disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onMaybeLater}
          disabled={disabled}
          className="rounded-md border px-4 py-2 font-medium text-sm hover:bg-accent disabled:opacity-50"
        >
          Maybe later
        </button>
        <button
          type="button"
          onClick={onUpgrade}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
        >
          See plans
          <ArrowRightIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-md border bg-card px-4 py-3">
      <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
      <span className="text-sm leading-snug">{children}</span>
    </div>
  );
}
