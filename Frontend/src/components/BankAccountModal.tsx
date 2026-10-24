"use client";

import { Alert, Button, Input, Modal, Select } from "antd";
import { useEffect, useRef, useState } from "react";
import { AccountChoices, accountMatches } from "@/components/AccountChoices";
import { api, type AccountRow, type CustomerRow } from "@/lib/api";

const emptyAccount = { label: "", bankName: "", holderName: "", ifsc: "", accountNumber: "" };
const emptyCustomer = { name: "", mobile: "", email: "" };

export function BankAccountModal({
  open,
  initialMode,
  payAfter,
  customers,
  accounts,
  initialCustomerId = "",
  initialBankQuery = "",
  selectedAccountId = "",
  lockCustomer = false,
  onClose,
  onSaved,
  onPick,
  onCustomerCreated,
}: {
  open: boolean;
  initialMode: "choose" | "create" | "existing";
  payAfter: boolean;
  customers: CustomerRow[];
  accounts: AccountRow[];
  initialCustomerId?: string;
  initialBankQuery?: string;
  selectedAccountId?: string;
  lockCustomer?: boolean;
  onClose: () => void;
  onSaved: (account: AccountRow) => void;
  onPick?: (account: AccountRow) => void;
  onCustomerCreated?: (customer: CustomerRow) => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [bankQuery, setBankQuery] = useState("");
  const [pickId, setPickId] = useState("");
  const [chosenCustomer, setChosenCustomer] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [newCustomer, setNewCustomer] = useState(emptyCustomer);
  const [form, setForm] = useState(emptyAccount);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }
    if (wasOpen.current) return;
    wasOpen.current = true;
    const preset = customers.find((customer) => customer.id === initialCustomerId);
    setMode(initialMode);
    setError("");
    setBusy(false);
    setBankQuery(initialBankQuery);
    setPickId(selectedAccountId);
    setChosenCustomer(initialCustomerId);
    setCreatingNew(false);
    setNewCustomer(emptyCustomer);
    setForm({ ...emptyAccount, holderName: preset?.name ?? "" });
  }, [open, initialMode, initialCustomerId, initialBankQuery, selectedAccountId, customers]);

  const lockedCustomer = customers.find((customer) => customer.id === initialCustomerId);
  const filtered = accounts.filter((account) => accountMatches(account, chosenCustomer, bankQuery));
  const title =
    mode === "choose" ? "Bank account needed" : mode === "existing" ? "Use an existing account" : "New bank account";
  const canGoBack = initialMode === "choose" && mode !== "choose";

  async function save() {
    setError("");
    let customerId = lockCustomer ? initialCustomerId : chosenCustomer;
    if (creatingNew) {
      if (newCustomer.name.trim().length < 2) {
        setError("Enter the customer name.");
        return;
      }
      if (newCustomer.email.trim() && !newCustomer.email.includes("@")) {
        setError("Enter a valid email or leave it blank.");
        return;
      }
    } else if (!customerId) {
      setError("Search and choose a customer, or create a new one.");
      return;
    }
    if (!form.bankName.trim() || !form.holderName.trim()) {
      setError("Enter the bank name and account holder.");
      return;
    }
    if (form.ifsc.trim().length !== 11) {
      setError("IFSC must be 11 characters.");
      return;
    }
    if (form.accountNumber.trim().length < 6) {
      setError("Enter the full account number.");
      return;
    }

    setBusy(true);
    try {
      if (creatingNew) {
        const created = await api.addCustomer({
          name: newCustomer.name.trim(),
          mobile: newCustomer.mobile.trim() || undefined,
          email: newCustomer.email.trim() || undefined,
        });
        customerId = created.id;
        setChosenCustomer(created.id);
        setCreatingNew(false);
        onCustomerCreated?.(created);
      }
      const account = await api.addAccount({
        label: form.label.trim(),
        bankName: form.bankName.trim(),
        holderName: form.holderName.trim(),
        ifsc: form.ifsc.trim().toUpperCase(),
        accountNumber: form.accountNumber.trim(),
        customerId,
      });
      onSaved(account);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add account");
    } finally {
      setBusy(false);
    }
  }

  function useExisting() {
    const account = accounts.find((row) => row.id === pickId);
    if (!account) {
      setError("Choose a bank account.");
      return;
    }
    onPick?.(account);
  }

  return (
    <Modal open={open} title={title} onCancel={onClose} footer={null} destroyOnHidden width={560}>
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      {mode === "choose" ? (
        <>
          <p className="muted">No bank account is selected. Create a new one, or use an account that is already saved.</p>
          <div className="account-list">
            <button type="button" className="account" onClick={() => setMode("existing")}>
              <span>
                <strong>Use an existing account</strong>
                <div className="muted">Search by customer and bank, then select it.</div>
              </span>
            </button>
            <button type="button" className="account" onClick={() => setMode("create")}>
              <span>
                <strong>Create a new account</strong>
                <div className="muted">Add a customer and their bank account now.</div>
              </span>
            </button>
          </div>
        </>
      ) : null}
      {mode === "existing" ? (
        <>
          <label className="field">
            <span>Customer</span>
            <Select
              showSearch
              allowClear
              placeholder="Search customer"
              optionFilterProp="label"
              style={{ width: "100%" }}
              value={chosenCustomer || undefined}
              onChange={(value) => setChosenCustomer(value ?? "")}
              options={customers.map((customer) => ({
                value: customer.id,
                label: customer.mobile ? `${customer.name} · ${customer.mobile}` : customer.name,
              }))}
              notFoundContent="No customer found"
            />
          </label>
          <label className="field">
            <span>Bank</span>
            <Input
              allowClear
              placeholder="Search bank, IFSC, or account"
              value={bankQuery}
              onChange={(e) => setBankQuery(e.target.value)}
            />
          </label>
          <AccountChoices
            accounts={filtered}
            value={pickId}
            onChange={setPickId}
            name="settlement-account-modal"
            empty="No saved account matches. Create a new one instead."
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            {canGoBack ? (
              <Button onClick={() => setMode("choose")} style={{ marginRight: "auto" }}>
                Back
              </Button>
            ) : null}
            <Button onClick={() => setMode("create")}>Create new</Button>
            <Button type="primary" onClick={useExisting}>
              {payAfter ? "Use this account and pay" : "Use this account"}
            </Button>
          </div>
        </>
      ) : null}
      {mode === "create" ? (
        <>
          {lockCustomer ? (
            <p>
              Customer <strong>{lockedCustomer?.name ?? "Selected customer"}</strong>
            </p>
          ) : (
            <>
              <label className="field">
                <span>Customer</span>
                <Select
                  showSearch
                  allowClear
                  disabled={creatingNew}
                  placeholder="Search customer"
                  optionFilterProp="label"
                  style={{ width: "100%" }}
                  value={chosenCustomer || undefined}
                  onChange={(value) => {
                    const id = value ?? "";
                    setChosenCustomer(id);
                    const customer = customers.find((row) => row.id === id);
                    setForm((current) => (current.holderName ? current : { ...current, holderName: customer?.name ?? "" }));
                  }}
                  options={customers.map((customer) => ({
                    value: customer.id,
                    label: customer.mobile ? `${customer.name} · ${customer.mobile}` : customer.name,
                  }))}
                  notFoundContent="No customer found"
                />
              </label>
              <Button type="link" style={{ paddingLeft: 0, marginTop: -8 }} onClick={() => setCreatingNew((value) => !value)}>
                {creatingNew ? "Use an existing customer" : "Create a new customer"}
              </Button>
              {creatingNew ? (
                <>
                  <label className="field">
                    <span>Customer name</span>
                    <Input
                      value={newCustomer.name}
                      onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Mobile</span>
                    <Input
                      value={newCustomer.mobile}
                      onChange={(e) => setNewCustomer({ ...newCustomer, mobile: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <Input
                      value={newCustomer.email}
                      onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                    />
                  </label>
                </>
              ) : null}
            </>
          )}
          <label className="field">
            <span>Nickname</span>
            <Input
              value={form.label}
              placeholder="HDFC savings"
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Bank name</span>
            <Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
          </label>
          <label className="field">
            <span>Account holder</span>
            <Input value={form.holderName} onChange={(e) => setForm({ ...form, holderName: e.target.value })} />
          </label>
          <label className="field">
            <span>IFSC</span>
            <Input
              value={form.ifsc}
              maxLength={11}
              onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })}
            />
          </label>
          <label className="field">
            <span>Account number</span>
            <Input
              value={form.accountNumber}
              onChange={(e) => setForm({ ...form, accountNumber: e.target.value.replace(/\s/g, "") })}
            />
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            {canGoBack ? (
              <Button onClick={() => setMode("choose")} style={{ marginRight: "auto" }}>
                Back
              </Button>
            ) : null}
            <Button onClick={onClose}>Cancel</Button>
            <Button type="primary" loading={busy} onClick={() => void save()}>
              {payAfter ? "Save and pay" : "Save account"}
            </Button>
          </div>
        </>
      ) : null}
    </Modal>
  );
}
