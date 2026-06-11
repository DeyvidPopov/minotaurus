// app/(auth)/login/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock, ArrowRight, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api/auth";
import { errorMessage } from "@/lib/api/error-message";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "At least 6 characters"),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      const { user } = await authApi.login(values);
      toast.success("Signed in");
      router.push(user.defaultProjectId ? `/projects/${user.defaultProjectId}` : "/dashboard");
    } catch (err) {
      const message = errorMessage(err, "Could not sign in");
      // Keep the sign-in error on screen long enough to read (sonner's default is short).
      toast.error(message, { duration: 6000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[380px] bg-panel border border-border rounded-xl p-7 shadow-md">
      <h1 className="text-xl font-semibold tracking-tight m-0 mb-1">Welcome back</h1>
      <p className="text-fg-muted text-[13px] m-0 mb-5">Sign in to your workspace.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 mb-4">
        <Field label="Email" htmlFor="login-email" error={errors.email?.message}>
          <div className="relative">
            <Mail size={14} aria-hidden className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              {...register("email")}
              id="login-email"
              type="email"
              autoComplete="email"
              className="w-full bg-panel border border-border rounded-sm py-2 pl-8 pr-3 text-[13.5px] outline-none focus:border-accent"
              placeholder="you@company.com"
            />
          </div>
        </Field>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="login-password" className="text-[12.5px] text-fg-muted font-medium">Password</label>
            <Link href="/forgot-password" className="text-[11.5px] text-accent font-medium">Forgot password?</Link>
          </div>
          <div className="relative">
            <Lock size={14} aria-hidden className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              {...register("password")}
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className="w-full bg-panel border border-border rounded-sm py-2 pl-8 pr-9 text-[13.5px] outline-none focus:border-accent"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute right-2 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-sm text-fg-subtle hover:text-fg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] motion-safe:transition-colors"
            >
              {showPassword ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
            </button>
          </div>
          {errors.password && <span className="text-[11px] text-danger">{errors.password.message}</span>}
        </div>
        <Button type="submit" variant="primary" className="h-9 mt-1" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"} <ArrowRight size={14} />
        </Button>
      </form>
      <div className="text-[12.5px] text-fg-muted text-center mt-3">
        New here? <Link href="/register" className="text-accent font-medium">Create an account</Link>
      </div>
    </div>
  );
}

function Field({ label, htmlFor, error, children }: { label: string; htmlFor?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[12.5px] text-fg-muted font-medium">{label}</label>
      {children}
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}
