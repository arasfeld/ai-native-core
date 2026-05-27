import type { Metadata } from "next";
import { TermsPage } from "@/features/legal";

export const metadata: Metadata = {
  title: "Terms of Service — AI Native Core",
  description:
    "The terms that govern your use of AI Native Core, including acceptable use, billing, and liability.",
};

export default function Page() {
  return <TermsPage />;
}
