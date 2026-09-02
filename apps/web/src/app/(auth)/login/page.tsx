import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { Factory, ShieldCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Login | PaperMill ERP",
  description: "Enterprise Resource Planning for Kraft Paper Manufacturing",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-8 border border-slate-200">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-12 w-12 bg-slate-900 rounded-xl flex items-center justify-center mb-3 shadow-md">
            <Factory className="h-7 w-7 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            PaperMill ERP
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-mono uppercase tracking-wider">
            Kraft Manufacturing & Deckle Optimization
          </p>
        </div>

        {/* Form Wrapped in Suspense */}
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <LoginForm />
        </Suspense>

        {/* Security badge */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Role-Based Access Control • Strict GSM Isolation</span>
        </div>
      </div>
    </div>
  );
}
