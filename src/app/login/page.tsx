import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Globe } from "lucide-react";
import { auth } from "@/lib/auth";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({
    headers: reqHeaders,
  });

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="rounded-lg bg-primary p-2 text-primary-foreground shadow-sm">
            <Globe className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-extrabold tracking-tight text-foreground">
            ExportTrack
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to access your dashboard
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
