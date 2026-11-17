"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, BellRing, Camera, MapPin } from "lucide-react";
import { fetchWithGeneric } from "@/src/lib/api-client";
import { AuthTokenData } from "@/src/types/auth";
import { Logo } from "@/src/components/layout/Logo";
import { ThemeToggle } from "@/src/components/layout/ThemeToggle";
import { Disclaimer } from "@/src/components/layout/Footer";
import { Field, Input } from "@/src/components/ui/Input";
import { Button } from "@/src/components/ui/Button";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await fetchWithGeneric<AuthTokenData>("/Auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: email, password }),
      });

      if (result.type === "Success") {
        localStorage.setItem("token", result.data.access_token);
        localStorage.setItem("refresh_token", result.data.refresh_token);
        console.log("Login reușit! Token salvat.");
        router.push("/");
      } else {
        setError(result.message.join(", "));
        setSubmitting(false);
      }
    } catch (err) {
      setError((err instanceof Error && err.message) || "Login failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:grid-rows-1">
      {/* Brand panel */}
      <aside className="flex flex-col justify-between gap-10 border-b border-border bg-subtle px-6 py-4 sm:px-10 lg:border-b-0 lg:border-r lg:py-12">
        <div className="flex items-center justify-between">
          <Logo />
          <span className="lg:hidden"><ThemeToggle /></span>
        </div>
        <div className="max-lg:hidden">
          <h1 className="max-w-md text-4xl font-extrabold leading-[1.05] tracking-tight">Have you seen someone on the wanted list?</h1>
          <ul className="mt-8 grid max-w-md gap-4 text-muted">
            <li className="flex gap-3"><MapPin className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" /> Report where and when you saw them, on a map.</li>
            <li className="flex gap-3"><Camera className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" /> Add a photo: it is compared automatically with the list.</li>
            <li className="flex gap-3"><BellRing className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" /> Get a live alert when someone is reported near you.</li>
          </ul>
        </div>
        <Disclaimer className="text-sm text-muted max-lg:hidden" />
      </aside>

      {/* Form */}
      <main id="main" className="flex flex-col px-6 py-10 sm:px-10">
        <div className="hidden justify-end lg:flex"><ThemeToggle /></div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
          <h2 className="text-3xl font-extrabold tracking-tight">Sign in</h2>
          <p className="mt-2 text-muted">Use the account you received for Sightline.</p>

          {error && (
            <div role="alert" className="mt-6 flex gap-3 rounded-md border border-alert bg-alert-soft p-3 text-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-alert" aria-hidden="true" />
              <span className="break-words">{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-6 grid gap-5" noValidate={false}>
            <Field label="Username or email">
              <Input
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>

            <Field label="Password">
              <Input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            <Button type="submit" size="lg" loading={submitting} className="w-full">
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
        <Disclaimer className="mt-10 text-center text-sm text-muted lg:hidden" />
      </main>
    </div>
  );
}
