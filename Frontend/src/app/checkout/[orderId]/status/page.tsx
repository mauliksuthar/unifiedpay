"use client";

import { Alert, Button, Card } from "antd";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/api";

function PaymentStatusInner() {
  const params = useParams<{ orderId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const id = search.get("paymentId") ?? params.orderId;
  const [payment, setPayment] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const p = await api.getPayment(id);
        if (alive) setPayment(p);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Not found");
      }
    };
    void tick();
    const t = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  return (
    <Card>
      <h1 className="hero-title" style={{ fontSize: "1.75rem" }}>
        Payment status
      </h1>
      {payment ? (
        <>
          <p>
            Status: <strong>{String(payment.status)}</strong>
          </p>
          <p className="muted">Gateway: {String(payment.gatewayCode)}</p>
          <p className="muted">UTR: {String(payment.utr ?? "pending")}</p>
          <p className="muted">
            Amount ₹{(Number(payment.amountPaise) / 100).toFixed(2)} · Rail {String(payment.rail)}
          </p>
        </>
      ) : (
        <p className="muted">Checking…</p>
      )}
      {error ? <Alert type="error" showIcon title={error} style={{ marginTop: 16 }} /> : null}
      <Button style={{ marginTop: 16 }} onClick={() => router.push("/dashboard")}>
        Back to dashboard
      </Button>
    </Card>
  );
}

export default function PaymentStatusPage() {
  return (
    <main className="auth-frame">
      <div className="auth-frame-inner">
        <Suspense fallback={<Card>Loading status…</Card>}>
          <PaymentStatusInner />
        </Suspense>
      </div>
    </main>
  );
}
