import type { Metadata } from "next";
import { PrivacyPage } from "@/features/legal";

export const metadata: Metadata = {
  title: "Privacy Policy — AI Native Core",
  description:
    "What data AI Native Core collects, how we use it, who we share it with, and the rights you have over it.",
};

export default function Page() {
  return <PrivacyPage />;
}
