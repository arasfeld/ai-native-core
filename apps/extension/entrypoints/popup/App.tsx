import { createAuthClient } from "better-auth/react";
import { useState } from "react";

// Auth client pointing at the Next.js app
const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_APP_URL ?? "http://localhost:3000",
});

export default function App() {
  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result = await authClient.signIn.email({ email, password });
    if (result.error) setError(result.error.message ?? "Sign in failed");
  }

  if (isPending) {
    return <div style={{ padding: 16 }}>Loading…</div>;
  }

  if (session) {
    return (
      <div style={{ padding: 16, minWidth: 280 }}>
        <p>
          Signed in as <strong>{session.user.email}</strong>
        </p>
        <button type="button" onClick={() => authClient.signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSignIn}
      style={{
        padding: 16,
        minWidth: 280,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <h2 style={{ margin: 0 }}>AI Native Core</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <button type="submit">Sign in</button>
    </form>
  );
}
