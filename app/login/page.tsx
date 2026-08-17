import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAuthenticated()) redirect("/");
  const { error } = await searchParams;
  return <main className="login"><section className="card login-card">
    <div className="brand"><span className="mark">S</span> Sleeper Coach</div>
    <h2 style={{marginTop:32}}>Private command center</h2>
    <p className="muted">Enter the app password to access your leagues and recommendations.</p>
    <form action="/api/auth/login" method="post">
      <input name="password" type="password" placeholder="App password" required autoFocus />
      {error && <p className="error">Incorrect password.</p>}
      <button className="button" type="submit">Sign in</button>
    </form>
  </section></main>;
}
