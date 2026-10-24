"use client";

import { Alert, Button, Card } from "antd";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/api";

function CheckoutInner() {
  const params = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .getOrder(params.orderId)
      .then(setOrder)
      .catch((e) => setError(e instanceof Error ? e.message : "Order not found"));
  }, [params.orderId]);

  async function pay() {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("up_token");
      if (!token) {
        setError("Merchant must be logged in to start payment in this Phase 1 demo.");
        return;
      }
      const payment = await api.startPayment(params.orderId);
      const url = String(payment.checkoutUrl ?? "");
      if (url) window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setLoading(false);
    }
  }

  if (!order && !error) return <Card>Loading checkout…</Card>;

  return (
    <Card>
      <p className="kicker">Hosted checkout · Phase 1</p>
      <h1 className="hero-title" style={{ fontSize: "1.75rem" }}>
        Pay securely
      </h1>
      {order ? (
        <>
          <p>
            Order <code>{String(order.merchantOrderRef)}</code>
          </p>
          <p className="stat-value">₹{(Number(order.amountPaise) / 100).toFixed(2)}</p>
          <p className="muted">
            You will be redirected to the payment gateway. Card details are never typed on UnifiedPay. Settlement goes
            to the merchant bank via the PG.
          </p>
          <Button type="primary" size="large" block disabled={loading} onClick={pay}>
            {loading ? "Starting…" : "Pay with credit card"}
          </Button>
        </>
      ) : null}
      {error ? <Alert type="error" showIcon title={error} style={{ marginTop: 16 }} /> : null}
    </Card>
  );
}

export default function CheckoutPage() {
  return (
    <main className="auth-frame">
      <div className="auth-frame-inner">
        <Suspense fallback={<Card>Loading checkout…</Card>}>
          <CheckoutInner />
        </Suspense>
      </div>
    </main>
  );
}
