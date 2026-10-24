"use client";

import { Alert, Button, Card, Col, Input, Row, Select } from "antd";
import Script from "next/script";
import { useEffect, useState } from "react";
import { AccountChoices, accountMatches } from "@/components/AccountChoices";
import { BankAccountModal } from "@/components/BankAccountModal";
import { PageHeading } from "@/components/PageHeading";
import { api, type AccountRow, type CustomerRow } from "@/lib/api";

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
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [accountId, setAccountId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [bankQuery, setBankQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"choose" | "create" | "existing">("create");
  const [payAfter, setPayAfter] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(preferId?: string) {
    const [acct, cust] = await Promise.all([api.accounts(), api.customers()]);
    const rows = acct.data ?? [];
    setAccounts(rows);
    setCustomers(cust.data ?? []);
    setAccountId((current) => {
      const open = rows.filter((row) => !row.isFrozen);
      if (preferId && open.some((row) => row.id === preferId)) return preferId;
      if (current && open.some((row) => row.id === current)) return current;
      return open.find((row) => row.isDefault)?.id ?? open[0]?.id ?? "";
    });
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  const visible = accounts.filter((account) => !account.isFrozen && accountMatches(account, customerId, bankQuery));
  const selected = accounts.find((account) => account.id === accountId);
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";

  function onCustomer(value: string) {
    setCustomerId(value);
    const rows = accounts.filter((account) => !account.isFrozen && accountMatches(account, value, bankQuery));
    setAccountId((current) => {
      if (current && rows.some((row) => row.id === current)) return current;
      return rows.find((row) => row.isDefault)?.id ?? rows[0]?.id ?? "";
    });
  }

  function onBankQuery(value: string) {
    setBankQuery(value);
    const rows = accounts.filter((account) => !account.isFrozen && accountMatches(account, customerId, value));
    setAccountId((current) => (current && rows.some((row) => row.id === current) ? current : ""));
  }

  function closeModal() {
    setModalOpen(false);
    setPayAfter(false);
  }

  async function payWithRazorpay(forcedId?: string, forced?: AccountRow) {
    setError("");
    setSuccess("");
    const paise = Math.round(Number(amount) * 100);
    if (!Number.isFinite(paise) || paise < 100) {
      setError("Minimum amount is ₹1.");
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

    const id = forcedId || accountId;
    const dest = forced ?? accounts.find((account) => account.id === id);
    if (dest?.isFrozen) {
      setError("That bank account is frozen. Choose another account.");
      return;
    }
    if (!id || !dest) {
      setPayAfter(true);
      setModalMode("choose");
      setModalOpen(true);
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
        description: `Rent to ${dest.customerName || dest.label}`,
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

  async function handleSaved(account: AccountRow) {
    const shouldPay = payAfter;
    setModalOpen(false);
    setPayAfter(false);
    await load(account.id);
    if (account.customerId) setCustomerId(account.customerId);
    if (shouldPay) await payWithRazorpay(account.id, account);
  }

  function handlePick(account: AccountRow) {
    const shouldPay = payAfter;
    setAccountId(account.id);
    if (account.customerId) setCustomerId(account.customerId);
    setModalOpen(false);
    setPayAfter(false);
    if (shouldPay) void payWithRazorpay(account.id, account);
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
              <label className="field">
                <span>Customer</span>
                <Select
                  showSearch
                  allowClear
                  placeholder="Search customer"
                  optionFilterProp="label"
                  style={{ width: "100%" }}
                  value={customerId || undefined}
                  onChange={(value) => onCustomer(value ?? "")}
                  options={customers.map((customer) => ({
                    value: customer.id,
                    label: customer.mobile ? `${customer.name} · ${customer.mobile}` : customer.name,
                  }))}
                  notFoundContent="No customer yet. Add one from Accounts, or while paying."
                />
              </label>
              <label className="field">
                <span>Bank</span>
                <Input
                  allowClear
                  placeholder="Search bank, IFSC, or account"
                  value={bankQuery}
                  onChange={(e) => onBankQuery(e.target.value)}
                />
              </label>
              {accounts.length === 0 ? <p className="muted">Add a bank account before transferring.</p> : null}
              <AccountChoices
                accounts={visible}
                value={accountId}
                onChange={setAccountId}
                empty={
                  customerId
                    ? "This customer has no matching bank account."
                    : "No bank account matches this search."
                }
              />
              <Button
                htmlType="button"
                style={{ marginTop: 12 }}
                onClick={() => {
                  setPayAfter(false);
                  setModalMode("create");
                  setModalOpen(true);
                }}
              >
                {accounts.length ? "Add another account" : "Add account"}
              </Button>
              <p className="muted" style={{ marginTop: 8 }}>
                Saved accounts are managed customer-wise under Accounts. If none is selected, Pay asks you to create a new account or use an existing one.
              </p>
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
                  <strong>{selected.label}</strong> · {selected.bankName}
                  {selected.isDefault ? " · Primary" : ""}
                </p>
                <p className="muted">{selected.customerName || selected.holderName}</p>
                {selected.customerName && selected.customerName !== selected.holderName ? (
                  <p className="muted">{selected.holderName}</p>
                ) : null}
                <p className="muted">IFSC {selected.ifsc}</p>
                <p className="muted">Account ****{selected.accountLast4}</p>
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
      <BankAccountModal
        open={modalOpen}
        initialMode={modalMode}
        payAfter={payAfter}
        customers={customers}
        accounts={accounts.filter((account) => !account.isFrozen)}
        initialCustomerId={customerId}
        initialBankQuery={bankQuery}
        selectedAccountId={accountId}
        onClose={closeModal}
        onSaved={(account) => void handleSaved(account)}
        onPick={handlePick}
        onCustomerCreated={(customer) =>
          setCustomers((prev) =>
            prev.some((row) => row.id === customer.id)
              ? prev
              : [...prev, customer].sort((a, b) => a.name.localeCompare(b.name)),
          )
        }
      />
    </>
  );
}
