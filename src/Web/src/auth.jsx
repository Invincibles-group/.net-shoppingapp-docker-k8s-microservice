import { createContext, useContext, useState } from "react";
import { api } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    const raw = localStorage.getItem("auth");
    return raw ? JSON.parse(raw) : null; // { token, username, role }
  });

  function persist(a) {
    if (a) localStorage.setItem("auth", JSON.stringify(a));
    else localStorage.removeItem("auth");
    setAuth(a);
  }

  async function login(username, password) {
    const res = await api.login(username, password);
    persist(res);
    return res;
  }
  async function register(username, password) {
    const res = await api.register(username, password);
    persist(res);
    return res;
  }
  function logout() { persist(null); }

  const value = {
    user: auth ? { username: auth.username, role: auth.role } : null,
    token: auth?.token ?? null,
    isAdmin: auth?.role === "Admin",
    login, register, logout
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
