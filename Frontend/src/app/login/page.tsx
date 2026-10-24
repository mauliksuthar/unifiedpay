"use client";

import { Alert, Button, Input } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { api, saveAuth } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const auth = await api.login(String(fd.get("email")), String(fd.get("password")));
      saveAuth(auth);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <AuthFrame
      title="Welcome back!"
      lead="Sign in to your account to continue"
      footer={
        <p>
          New? <Link href="/register">Register</Link>
        </p>
      }
    >
      <form onSubmit={onSubmit}>
        <label className="field">
          <span>Email</span>
          <Input name="email" type="email" size="large" required />
        </label>
        <label className="field">
          <span>Password</span>
          <Input name="password" type="password" size="large" required />
        </label>
        {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
        <Button type="primary" htmlType="submit" size="large" block>
          Login
        </Button>
      </form>
    </AuthFrame>
  );
}
