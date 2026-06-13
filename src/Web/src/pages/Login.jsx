import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = mode === "login"
        ? await login(username.trim(), password)
        : await register(username.trim(), password);
      const dest = res.role === "Admin" ? "/admin" : (location.state?.from?.pathname ?? "/");
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-head">
          <span className="brand-mark big" aria-hidden>◆</span>
          <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="muted">{mode === "login" ? "Sign in to shop and track orders." : "It takes a few seconds."}</p>
        </div>

        <div className="tabs">
          <button className={mode === "login" ? "tab on" : "tab"} onClick={() => { setMode("login"); setError(null); }}>Sign in</button>
          <button className={mode === "register" ? "tab on" : "tab"} onClick={() => { setMode("register"); setError(null); }}>Register</button>
        </div>

        <form onSubmit={submit} className="auth-form">
          <label>
            <span>Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button className="btn btn-block" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="auth-hint">
          Try the admin dashboard with <code>admin</code> / <code>admin123</code>.
        </p>
      </div>
    </div>
  );
}
