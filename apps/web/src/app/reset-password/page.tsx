import { Suspense } from "react";
import { ResetPasswordPage } from "@/features/auth/components/ResetPasswordPage";

export default function Page() {
  return (
    <Suspense>
      <ResetPasswordPage />
    </Suspense>
  );
}
