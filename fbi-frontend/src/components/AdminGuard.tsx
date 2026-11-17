"use client";

import Link from "next/link";
import { useRole } from "@/src/lib/use-role";

// Client-side gate for admin pages. The API enforces the role too; this only avoids
// rendering an empty or failing page for non-admin users.
export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const role = useRole();

  if (role === "ADMIN") return <>{children}</>;

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center" role="alert">
        <h1 className="text-2xl font-bold">Not authorized</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">This page is only available to administrators.</p>
        <Link href="/" className="mt-6 inline-block font-semibold underline">
          Back to the wanted list
        </Link>
      </div>
    </main>
  );
}
