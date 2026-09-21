import { redirect } from "next/navigation";

/** Completing a run is done from the single floor screen now. */
export default function OperatorCompleteRunPage() {
  redirect("/operator");
}
