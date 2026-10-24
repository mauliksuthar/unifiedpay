const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:5280";

export type TxnDetail = {
  summary: Record<string, unknown>;
  card: Record<string, unknown>;
  bank: Record<string, unknown>;
  money: Record<string, unknown>;
  gateway: Record<string, unknown>;
  refunds: Array<Record<string, unknown>>;
  timeline: Array<{ name: string; state: string; at: string; detail: string }>;
};

export type AuthResponse = {
  accessToken: string;
  expiresIn: number;
  merchantId: string;
  apiKey: string;
  status: string;
};

function authHeader(): HeadersInit {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("up_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message ?? data?.title ?? res.statusText;
    throw new Error(msg);
  }
  return data as T;
}

export const api = {
  base: API_BASE,
  register: (body: Record<string, unknown>) =>
    request<AuthResponse>("/v1/auth/merchant/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>("/v1/auth/merchant/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  adminLogin: (email: string, password: string) =>
    request<{ access_token: string; expires_in: number }>("/v1/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<Record<string, unknown>>("/v1/merchants/me"),
  orders: () => request<{ data: Array<Record<string, unknown>> }>("/v1/orders"),
  createOrder: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>("/v1/orders", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getOrder: (id: string) => request<Record<string, unknown>>(`/v1/orders/${id}`),
  startPayment: (orderId: string) =>
    request<Record<string, unknown>>(`/v1/orders/${orderId}/payments`, {
      method: "POST",
      body: JSON.stringify({ rail: "CREDIT" }),
      headers: { "Idempotency-Key": crypto.randomUUID() },
    }),
  getPayment: (id: string) => request<Record<string, unknown>>(`/v1/payments/${id}`),
  transactions: () =>
    request<{ data: Array<Record<string, unknown>> }>("/v1/merchants/me/transactions"),
  history: (bucket: "success" | "failed" | "reversed" | "settlement" | "all") =>
    request<{ data: Array<Record<string, unknown>> }>(`/v1/merchants/me/history/${bucket}`),
  transaction: (id: string) => request<TxnDetail>(`/v1/merchants/me/transactions/${id}`),
  accounts: () => request<{ data: Array<Record<string, unknown>> }>("/v1/merchants/me/accounts"),
  addAccount: (body: Record<string, string>) =>
    request<Record<string, unknown>>("/v1/merchants/me/accounts", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  cardToBank: (body: {
    amountPaise: number;
    settlementAccountId: string;
    cardHolderName: string;
    cardBrand: string;
    cardLast4: string;
    cardExpiry: string;
    customerEmail?: string;
  }) =>
    request<Record<string, unknown>>("/v1/merchants/me/card-to-bank", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  reverse: (id: string) =>
    request<Record<string, unknown>>(`/v1/merchants/me/transactions/${id}/reverse`, { method: "POST" }),
  createRazorpayOrder: (amount: number, receipt?: string) =>
    request<{ order_id: string; amount: number; currency: string }>("/api/create-order", {
      method: "POST",
      body: JSON.stringify({ amount, currency: "INR", receipt }),
    }),
  verifyRazorpayPayment: (body: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) =>
    request<{ success: boolean; paid: boolean; razorpay_payment_id: string }>("/api/verify-payment", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminMerchants: (token: string) =>
    fetch(`${API_BASE}/v1/admin/merchants`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? res.statusText);
      return data as { data: Array<Record<string, unknown>> };
    }),
  freezeMerchant: (token: string, id: string, reason: string) =>
    fetch(`${API_BASE}/v1/admin/merchants/${id}/freeze`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? res.statusText);
      return data;
    }),
  issueInvoice: (token: string, id: string) =>
    fetch(`${API_BASE}/v1/admin/merchants/${id}/invoices/weekly`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? res.statusText);
      return data;
    }),
};

export function saveAuth(auth: AuthResponse) {
  localStorage.setItem("up_token", auth.accessToken);
  localStorage.setItem("up_merchant_id", auth.merchantId);
  localStorage.setItem("up_api_key", auth.apiKey);
}

export function clearAuth() {
  localStorage.removeItem("up_token");
  localStorage.removeItem("up_merchant_id");
  localStorage.removeItem("up_api_key");
  localStorage.removeItem("up_admin_token");
}
