import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { Factory } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Sign in | PaperMill ERP",
  description: "Enterprise Resource Planning for Kraft Paper Manufacturing",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,46%)_minmax(0,54%)]">
      {/* Left — sign-in form */}
      <div className="flex min-h-screen flex-col justify-center px-6 py-10 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 text-white shadow-md shadow-blue-500/20">
              <Factory className="h-5 w-5 stroke-[2.2]" />
            </div>
            <span className="text-[15px] font-extrabold tracking-tight text-slate-900">
              HRA MILL
            </span>
          </div>

          <h1 className="text-[28px] font-black tracking-tight text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">
            Kraft manufacturing &amp; deckle optimization.
          </p>

          <div className="mt-8">
            <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </div>

      {/* Right — brand panel */}
      <div className="hidden p-3 lg:block">
        <div className="relative flex h-full flex-col justify-end overflow-hidden rounded-[28px] bg-neutral-950 p-10 text-white">
          {/* decorative glow + oversized watermark */}
          <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-20 bottom-10 h-72 w-72 rounded-full bg-blue-600/10 blur-3xl" />
          <Factory
            className="pointer-events-none absolute -top-6 right-6 h-72 w-72 text-white/[0.04]"
            strokeWidth={1}
          />
          <div className="pointer-events-none absolute right-0 top-8 h-56 w-56 rotate-45 rounded-3xl bg-gradient-to-br from-white/10 to-transparent blur-2xl" />

          <div className="relative">
            <span className="text-sm font-semibold text-white/70">HRA MILL</span>
            <h2 className="mt-3 text-4xl font-black tracking-tight">Welcome back</h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/60">
              The control room for kraft paper — sales orders, deckle
              optimization, production runs and dispatch, all in one place.
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/50">
              Sign in with the account your mill administrator set up for you.
            </p>

            {/* nested card */}
            <div className="relative mt-8 max-w-md rounded-3xl bg-white/[0.06] p-6 backdrop-blur-sm ring-1 ring-white/10">
              <h3 className="text-xl font-bold leading-snug">
                Plan every reel, waste less trim
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/55">
                Real-time deckle planning and production tracking across all your
                paper machines.
              </p>
              <div className="mt-5 flex items-center gap-3">
                <div className="flex -space-x-2">
                  {[
                    ["bg-amber-300 text-amber-900", "RP"],
                    ["bg-sky-300 text-sky-900", "PS"],
                    ["bg-emerald-300 text-emerald-900", "VS"],
                  ].map(([cls, initials]) => (
                    <div
                      key={initials}
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold ring-2 ring-neutral-950 ${cls}`}
                    >
                      {initials}
                    </div>
                  ))}
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800 text-[10px] font-bold text-white/80 ring-2 ring-neutral-950">
                    +9
                  </div>
                </div>
                <span className="text-xs text-white/50">
                  Your team is already inside
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
