import { redirect } from "next/navigation";

/** The tablet is a single screen now; old per-run links land there. */
export default function OperatorActiveRunPage() {
  redirect("/operator");
}
