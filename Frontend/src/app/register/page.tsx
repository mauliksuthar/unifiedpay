"use client";

import { Alert, Button, Input } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { api, saveAuth } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const auth = await api.register({
        legalName: fd.get("legalName"),
        brandName: fd.get("brandName"),
        email: fd.get("email"),
        password: fd.get("password"),
        mobileE164: fd.get("mobile"),
        pan: fd.get("pan"),
        gstin: fd.get("gstin") || null,
        mcc: fd.get("mcc") || "5411",
        websiteUrl: fd.get("website"),
        settlementIfsc: fd.get("ifsc"),
        settlementAccountNumber: fd.get("account"),
      });
      saveAuth(auth);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame
      wide
      title="Merchant signup + KYC"
      lead="Settlement account must be the merchant bank — not UnifiedPay."
      footer={
        <p>
          Already registered? <Link href="/login">Login</Link>
        </p>
      }
    >
      <form onSubmit={onSubmit}>
        <label className="field">
          <span>Legal name</span>
          <Input name="legalName" size="large" required />
        </label>
        <label className="field">
          <span>Brand name</span>
          <Input name="brandName" size="large" />
        </label>
        <label className="field">
          <span>Email</span>
          <Input name="email" type="email" size="large" required />
        </label>
        <label className="field">
          <span>Password</span>
          <Input name="password" type="password" size="large" required minLength={8} />
        </label>
        <label className="field">
          <span>Mobile (+91…)</span>
          <Input name="mobile" size="large" required placeholder="+9198XXXXXXXX" />
        </label>
        <label className="field">
          <span>PAN</span>
          <Input name="pan" size="large" required maxLength={10} />
        </label>
        <label className="field">
          <span>GSTIN (optional)</span>
          <Input name="gstin" size="large" />
        </label>
        <label className="field">
          <span>MCC</span>
          <Input name="mcc" size="large" defaultValue="5411" />
        </label>
        <label className="field">
          <span>Website</span>
          <Input name="website" size="large" required placeholder="https://" />
        </label>
        <label className="field">
          <span>Settlement IFSC</span>
          <Input name="ifsc" size="large" required />
        </label>
        <label className="field">
          <span>Settlement account number</span>
          <Input name="account" size="large" required />
        </label>
        {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
        <Button type="primary" htmlType="submit" size="large" block disabled={loading}>
          {loading ? "Creating…" : "Create merchant"}
        </Button>
      </form>
    </AuthFrame>
  );
}
