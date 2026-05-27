// app/(auth)/register/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

const schema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "At least 6 characters"),
});
type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      await authApi.register(values);
      toast.success("Account created");
      router.push("/dashboard");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not create account";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[380px] bg-panel border border-border rounded-xl p-7 shadow-md">
      <h1 className="text-xl font-semibold tracking-tight m-0 mb-1">Create your account</h1>
      <p className="text-fg-muted text-[13px] m-0 mb-5">Start documenting your architecture in minutes.</p>
      <form className="flex flex-col gap-3 mb-4" onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-2 gap-2">
          <Field error={errors.firstName?.message}>
            <input {...register("firstName")} className="w-full bg-panel border border-border rounded-sm py-2 px-3 text-[13.5px] outline-none focus:border-accent" placeholder="First name" />
          </Field>
          <Field error={errors.lastName?.message}>
            <input {...register("lastName")} className="w-full bg-panel border border-border rounded-sm py-2 px-3 text-[13.5px] outline-none focus:border-accent" placeholder="Last name" />
          </Field>
        </div>
        <Field error={errors.email?.message}>
          <input {...register("email")} type="email" className="w-full bg-panel border border-border rounded-sm py-2 px-3 text-[13.5px] outline-none focus:border-accent" placeholder="Email" />
        </Field>
        <Field error={errors.password?.message}>
          <input {...register("password")} type="password" className="w-full bg-panel border border-border rounded-sm py-2 px-3 text-[13.5px] outline-none focus:border-accent" placeholder="Password (min 6 chars)" />
        </Field>
        <Button type="submit" variant="primary" className="h-9 mt-1" disabled={loading}>
          {loading ? "Creating…" : "Create account"} <ArrowRight size={14} />
        </Button>
      </form>
      <div className="text-[12.5px] text-fg-muted text-center mt-3">
        Already have an account? <Link href="/login" className="text-accent font-medium">Sign in</Link>
      </div>
    </div>
  );
}

function Field({ error, children }: { error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      {children}
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}
