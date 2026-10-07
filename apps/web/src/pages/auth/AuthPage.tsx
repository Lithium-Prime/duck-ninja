import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { signIn, signUp } from "@/lib/api";

export function AuthPage({
  mode,
  onDone,
}: {
  mode: "login" | "register";
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (mode === "register") {
        await signUp(email, password, name || email.split("@")[0]!);
      } else {
        await signIn(email, password);
      }
      onDone();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "失败");
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">
        {mode === "login" ? "登录" : "注册"}
      </h1>
      {mode === "register" && (
        <label className="block space-y-1 text-sm">
          <span>姓名</span>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      )}
      <label className="block space-y-1 text-sm">
        <span>邮箱</span>
        <input
          type="email"
          required
          className="w-full rounded-md border border-border bg-background px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>密码</span>
        <input
          type="password"
          required
          minLength={8}
          className="w-full rounded-md border border-border bg-background px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit">{mode === "login" ? "登录" : "注册"}</Button>
      <p className="text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            没有账号？ <Link to="/register">注册</Link>
          </>
        ) : (
          <>
            已有账号？ <Link to="/login">登录</Link>
          </>
        )}
      </p>
    </form>
  );
}
