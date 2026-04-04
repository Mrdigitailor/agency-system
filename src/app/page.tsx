import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  // ניתוב לפי תפקיד
  const role = (session.user as { role?: string })?.role;
  switch (role) {
    case "client":
      redirect("/client-portal");
    case "campaignManager":
      redirect("/tasks");
    default:
      redirect("/dashboard");
  }
}
