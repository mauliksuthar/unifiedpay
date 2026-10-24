import type { AccountRow } from "@/lib/api";

export function accountMatches(account: AccountRow, customerId: string, bankQuery: string) {
  if (customerId && (account.customerId ?? "") !== customerId) return false;
  const q = bankQuery.trim().toLowerCase();
  if (!q) return true;
  return [account.label, account.bankName, account.holderName, account.ifsc, account.accountLast4, account.customerName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export function accountDetail(account: AccountRow) {
  const parts: string[] = [];
  if (account.isDefault) parts.push("Primary");
  if (account.customerName && account.customerName !== account.holderName) parts.push(account.customerName);
  parts.push(account.holderName, account.ifsc, `****${account.accountLast4}`);
  return parts.join(" · ");
}

export function AccountChoices({
  accounts,
  value,
  onChange,
  name = "settlement-account",
  empty = "No bank account matches this search.",
}: {
  accounts: AccountRow[];
  value: string;
  onChange: (id: string) => void;
  name?: string;
  empty?: string;
}) {
  if (!accounts.length) return <p className="muted">{empty}</p>;
  return (
    <div className="account-list">
      {accounts.map((account) => (
        <label key={account.id} className={account.id === value ? "account on" : "account"}>
          <input type="radio" name={name} checked={account.id === value} onChange={() => onChange(account.id)} />
          <span>
            <strong>{account.label}</strong> · {account.bankName}
            <div className="muted">{accountDetail(account)}</div>
          </span>
        </label>
      ))}
    </div>
  );
}
