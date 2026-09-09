import { requirePlatform } from "@/server/auth-helpers";
import { NewMillForm } from "@/components/platform/new-mill-form";

export const metadata = { title: "Add Mill | Platform" };

export default async function NewMillPage() {
  await requirePlatform();
  return <NewMillForm />;
}
