"use client";

import { Alert, Button, Card, Col, Input, Row } from "antd";
import Script from "next/script";
import { useEffect, useState } from "react";
import { PageHeading } from "@/components/PageHeading";
import { api } from "@/lib/api";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void;
    };
  }
}

export default function TransferPage() {
  const [amount, setAmount] = useState("100");
  const [accounts, setAccounts] = useState<Array<Record<string, unknown>>>([]);
  const [accountId, setAccountId] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newAccount, setNewAccount] = useState({ label: "", bankName: "", holderName: "", ifsc: "", accountNumber: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadAccounts() {
    const res = await api.accounts();
    const rows = res.data ?? [];
    setAccounts(rows);
    setAccountId((current) => current || String(rows.find((a) => a.isDefault)?.id ?? rows[0]?.id ?? ""));
  }

  useEffect(() => {
    loadAccounts().catch(() => undefined);
  }, []);

  const selected = accounts.find((a) => String(a.id) === accountId);
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";

  async function addAccount() {
    setError("");
    try {
      const created = await api.addAccount(newAccount);
      await loadAccounts();
      setAccountId(String(created.id));
      setNewAccount({ label: "", bankName: "", holderName: "", ifsc: "", accountNumber: "" });
      setShowAdd(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add account");
    }
  }

  async function payWithRazorpay() {
    debugger
    setError("");
    setSuccess("");
    const paise = Math.round(Number(amount) * 100);
    if (!Number.isFinite(paise) || paise < 100) {
      setError("Minimum amount is ₹1.");
      return;
    }
    if (!accountId) {
      setError("Choose which bank account should receive this money.");
      return;
    }
    if (!keyId) {
      setError("Razorpay key id is missing from the frontend environment.");
      return;
    }
    if (!window.Razorpay) {
      setError("Razorpay checkout failed to load. Refresh and try again.");
      return;
    }

    setBusy(true);
    try {
      const order = await api.createRazorpayOrder(paise, `rent_${Date.now()}`);
      const rzp = new window.Razorpay({
        key: keyId,
        amount: order.amount,
        currency: order.currency,
        name: "UnifiedPay",
        description: selected ? `Rent to ${String(selected.label)}` : "Rent payment",
        order_id: order.order_id,
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verified = await api.verifyRazorpayPayment(response);
            if (!verified.paid) {
              setError("Payment was not verified.");
              return;
            }
            setSuccess(`Payment verified. Id ${verified.razorpay_payment_id}. Settlement follows the gateway to the selected bank.`);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Signature verification failed.");
          } finally {
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setError("Payment cancelled.");
          },
        },
        theme: { color: "#3b7ddd" },
      });
      rzp.on("payment.failed", (response) => {
        setBusy(false);
        setError(response.error?.description ?? "Payment failed.");
      });
      rzp.open();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Could not create Razorpay order.");
    }
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <PageHeading
        title="Card to bank account"
        subtitle="Razorpay opens its own card page. UnifiedPay never sees the card number or CVV. Test mode uses Razorpay test cards."
      />
      <Row gutter={[24, 24]}>
        <Col xs={24} lg={15}>
          <Card>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void payWithRazorpay();
              }}
            >
              <h2 className="section-label" style={{ marginTop: 0 }}>
                Which account should receive this money?
              </h2>
              {accounts.length === 0 ? <p className="muted">Add a bank account before transferring.</p> : null}
              <div className="account-list">
                {accounts.map((a) => (
                  <label key={String(a.id)} className={String(a.id) === accountId ? "account on" : "account"}>
                    <input
                      type="radio"
                      name="account"
                      checked={String(a.id) === accountId}
                      onChange={() => setAccountId(String(a.id))}
                      required
                    />
                    <span>
                      <strong>{String(a.label)}</strong> · {String(a.bankName)}
                      <div className="muted">
                        {String(a.holderName)} · {String(a.ifsc)} · ****{String(a.accountLast4)}
                      </div>
                    </span>
                  </label>
                ))}
              </div>
              <Button style={{ marginTop: 12 }} onClick={() => setShowAdd((v) => !v)}>
                {showAdd ? "Close" : "Add another account"}
              </Button>
              {showAdd ? (
                <div style={{ marginTop: 12 }}>
                  <label className="field">
                    <span>Nickname</span>
                    <Input
                      value={newAccount.label}
                      onChange={(e) => setNewAccount({ ...newAccount, label: e.target.value })}
                      placeholder="HDFC savings"
                    />
                  </label>
                  <label className="field">
                    <span>Bank name</span>
                    <Input value={newAccount.bankName} onChange={(e) => setNewAccount({ ...newAccount, bankName: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Account holder</span>
                    <Input value={newAccount.holderName} onChange={(e) => setNewAccount({ ...newAccount, holderName: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>IFSC</span>
                    <Input
                      value={newAccount.ifsc}
                      maxLength={11}
                      onChange={(e) => setNewAccount({ ...newAccount, ifsc: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Account number</span>
                    <Input
                      value={newAccount.accountNumber}
                      onChange={(e) => setNewAccount({ ...newAccount, accountNumber: e.target.value })}
                    />
                  </label>
                  <Button type="primary" onClick={addAccount}>
                    Save account
                  </Button>
                </div>
              ) : null}
              <h2 className="section-label">Amount</h2>
              <label className="field">
                <span>Amount (₹)</span>
                <Input type="number" min={1} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </label>
              {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
              {success ? <Alert type="success" showIcon title={success} style={{ marginBottom: 16 }} /> : null}
              <Button type="primary" htmlType="submit" size="large" block disabled={busy}>
                {busy ? "Opening Razorpay…" : "Pay with Razorpay"}
              </Button>
              <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
                Test card 4111 1111 1111 1111, any future expiry, any CVV. UPI success: success@razorpay.
              </p>
            </form>
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card title="Selected destination">
            {selected ? (
              <>
                <p>
                  <strong>{String(selected.label)}</strong> · {String(selected.bankName)}
                </p>
                <p className="muted">{String(selected.holderName)}</p>
                <p className="muted">IFSC {String(selected.ifsc)}</p>
                <p className="muted">Account ****{String(selected.accountLast4)}</p>
              </>
            ) : (
              <p className="muted">Choose an account on the left before you transfer.</p>
            )}
            <p className="muted" style={{ marginBottom: 0 }}>
              Paid by the licensed gateway to this account. UnifiedPay does not receive this amount.
            </p>
          </Card>
        </Col>
      </Row>
    </>
  );
}
