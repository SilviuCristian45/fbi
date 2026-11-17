"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { useRole } from "@/src/lib/use-role";
import { PageContainer } from "./layout/AppShell";
import { EmptyState } from "./ui/EmptyState";
import { buttonClasses } from "./ui/Button";

// Client-side gate for admin pages. The API enforces the role too; this only avoids
// rendering an empty or failing page for non-admin users.
export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const role = useRole();

  if (role === "ADMIN") return <>{children}</>;

  return (
    <PageContainer>
      <div role="alert">
        <EmptyState
          icon={ShieldAlert}
          titleAs="h1"
          title="Not authorized"
          description="This page is only available to administrators."
          action={<Link href="/" className={buttonClasses("primary")}>Back to the wanted list</Link>}
        />
      </div>
    </PageContainer>
  );
}
