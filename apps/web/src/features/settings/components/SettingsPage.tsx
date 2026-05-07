"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";
import { useRouter } from "next/navigation";
import { OrganizationTab } from "@/features/organizations/components/OrganizationTab";
import { AiTab } from "./AiTab";
import { ApiKeysTab } from "./ApiKeysTab";
import { AppearanceTab } from "./AppearanceTab";
import { ProfileTab } from "./ProfileTab";
import { SecurityTab } from "./SecurityTab";

const VALID_TABS = [
  "profile",
  "appearance",
  "api-keys",
  "organization",
  "ai",
  "security",
] as const;
type Tab = (typeof VALID_TABS)[number];

function isValidTab(t: string): t is Tab {
  return VALID_TABS.includes(t as Tab);
}

export function SettingsPage({ tab }: { tab: string }) {
  const router = useRouter();
  const activeTab: Tab = isValidTab(tab) ? tab : "profile";

  function onTabChange(value: string) {
    router.replace(`/settings?tab=${value}`, { scroll: false });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 font-semibold text-2xl">Settings</h1>
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-6">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="appearance" className="mt-6">
          <AppearanceTab />
        </TabsContent>
        <TabsContent value="api-keys" className="mt-6">
          <ApiKeysTab />
        </TabsContent>
        <TabsContent value="organization" className="mt-6">
          <OrganizationTab />
        </TabsContent>
        <TabsContent value="ai" className="mt-6">
          <AiTab />
        </TabsContent>
        <TabsContent value="security" className="mt-6">
          <SecurityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
