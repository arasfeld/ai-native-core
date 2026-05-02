import { SettingsPage } from "@/features/settings";

type Props = { searchParams: Promise<{ tab?: string }> };

export default async function Page({ searchParams }: Props) {
  const { tab = "profile" } = await searchParams;
  return <SettingsPage tab={tab} />;
}
