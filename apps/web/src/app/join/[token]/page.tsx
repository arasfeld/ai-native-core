import { JoinPage } from "@/features/organizations/components/JoinPage";

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <JoinPage token={token} />;
}
