"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Factory, Lock, Mail, AlertCircle, Loader2 } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await signIn("credentials", {
        email: values.email.trim().toLowerCase(),
        password: values.password,
        redirect: false,
      });

      if (result?.error) {
        setErrorMessage("Invalid email or password. Please try again.");
        toast.error("Authentication failed: Invalid credentials");
        setIsLoading(false);
      } else {
        toast.success("Login successful!");
        const callbackUrl = searchParams.get("callbackUrl") || "/";
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (err) {
      setErrorMessage("An unexpected error occurred during login.");
      toast.error("Login failed. Please try again.");
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (email: string) => {
    form.setValue("email", email);
    form.setValue("password", "password123");
  };

  return (
    <div className="w-full max-w-md space-y-6">
      {errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold uppercase text-slate-700">
                  Email Address
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="e.g. admin@papermill.local"
                      className="pl-9"
                      disabled={isLoading}
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold uppercase text-slate-700">
                  Password
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="password"
                      placeholder="••••••••••••"
                      className="pl-9"
                      disabled={isLoading}
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full h-11 text-base font-semibold shadow-sm mt-2"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign in to Factory Portal"
            )}
          </Button>
        </form>
      </Form>

      {/* Quick Demo Credentials Panel */}
      <div className="pt-4 border-t border-slate-200">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Demo Accounts (Password: password123)
        </p>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start text-xs h-8 font-mono"
            onClick={() => handleQuickLogin("admin@papermill.local")}
          >
            <span className="font-bold text-purple-700 mr-1.5">ADMIN</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start text-xs h-8 font-mono"
            onClick={() => handleQuickLogin("planner@papermill.local")}
          >
            <span className="font-bold text-blue-700 mr-1.5">PLANNER</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start text-xs h-8 font-mono"
            onClick={() => handleQuickLogin("sales@papermill.local")}
          >
            <span className="font-bold text-emerald-700 mr-1.5">SALES</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start text-xs h-8 font-mono"
            onClick={() => handleQuickLogin("operator@papermill.local")}
          >
            <span className="font-bold text-amber-700 mr-1.5">OPERATOR</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start text-xs h-8 font-mono col-span-2"
            onClick={() => handleQuickLogin("dispatch@papermill.local")}
          >
            <span className="font-bold text-sky-700 mr-1.5">DISPATCH</span>
            <span className="text-muted-foreground ml-auto">dispatch@papermill.local</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
