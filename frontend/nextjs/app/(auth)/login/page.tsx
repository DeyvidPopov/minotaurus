// app/(auth)/login/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "At least 6 characters"),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "deyvid@minotaurus.dev", password: "minotaurus" },
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      await authApi.login(values);
      toast.success("Signed in");
      router.push("/dashboard");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not sign in";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[380px] bg-panel border border-border rounded-xl p-7 shadow-md">
      <h1 className="text-xl font-semibold tracking-tight m-0 mb-1">Welcome back</h1>
      <p className="text-fg-muted text-[13px] m-0 mb-5">Sign in to your workspace.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 mb-4">
        <Field label="Email" error={errors.email?.message}>
          <div className="relative">
            <Mail size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input {...register("email")} className="w-full bg-panel border border-border rounded-sm py-2 pl-8 pr-3 text-[13.5px] outline-none focus:border-accent" placeholder="you@company.com" />
          </div>
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <div className="relative">
            <Lock size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input {...register("password")} type="password" className="w-full bg-panel border border-border rounded-sm py-2 pl-8 pr-3 text-[13.5px] outline-none focus:border-accent" placeholder="••••••••" />
          </div>
        </Field>
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

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12.5px] text-fg-muted font-medium">{label}</label>
      {children}
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}
