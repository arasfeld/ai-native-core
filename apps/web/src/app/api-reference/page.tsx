import type { Metadata } from "next";
import { ApiReferencePage } from "@/features/api-reference";

export const metadata: Metadata = {
  title: "API Reference — AI Native Core",
  description:
    "Interactive OpenAPI explorer for the AI Native Core API. Authenticate with a personal API key and call endpoints directly from your browser.",
};

export default function Page() {
  return <ApiReferencePage />;
}
