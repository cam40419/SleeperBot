import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getDashboardContext } from "@/lib/sleeper";
import { Dashboard } from "./ui/dashboard";

export const dynamic = "force-dynamic";
export default async function Home() {
  if (!(await isAuthenticated())) redirect("/login");
  const username = process.env.SLEEPER_USERNAME;
  if (!username) return <main className="login"><div className="card"><h2>Configuration needed</h2><p>Add <code>SLEEPER_USERNAME</code> to your environment.</p></div></main>;
  let context;
  try {
    context = await getDashboardContext(username);
  } catch (error) {
    return <main className="login"><div className="card"><h2>Sleeper sync failed</h2><p className="error">{error instanceof Error ? error.message : "Unknown error"}</p></div></main>;
  }
  return <Dashboard initial={context} />;
}
