"use client";

import { Button, Card, Col, Row } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";

const steps = [
  ["1. Signup", "PAN, bank, website — onboard as a merchant"],
  ["2. Checkout", "Hosted card checkout via PG (no card data on UnifiedPay)"],
  ["3. Commission", "Weekly invoice to UnifiedPay fee bank account"],
];

export default function HomePage() {
  const router = useRouter();

  return (
    <div className="public-shell">
      <header className="ak-navbar">
        <Link href="/" className="public-brand">
          UnifiedPay
        </Link>
        <div className="nav-actions">
          <Link href="/login">Merchant login</Link>
          <Button type="primary" onClick={() => router.push("/register")}>
            Start collecting
          </Button>
        </div>
      </header>
      <main className="public-main">
        <p className="kicker">Phase 1 — India business collection</p>
        <h1 className="hero-title">
          <strong>Credit card</strong> payments for your business
        </h1>
        <p className="lead">
          Customers pay by card through a licensed payment gateway. Money settles to <strong>your bank account</strong>.
          UnifiedPay earns commission by invoice — we never hold customer funds.
        </p>
        <div className="hero-actions">
          <Button type="primary" size="large" onClick={() => router.push("/register")}>
            Merchant signup + KYC
          </Button>
          <Button size="large" onClick={() => router.push("/admin")}>
            Admin
          </Button>
        </div>
        <Row gutter={[24, 24]}>
          {steps.map(([title, body]) => (
            <Col key={title} xs={24} md={8}>
              <Card>
                <h3 className="section-label" style={{ marginTop: 0 }}>
                  {title}
                </h3>
                <p className="muted" style={{ marginBottom: 0 }}>
                  {body}
                </p>
              </Card>
            </Col>
          ))}
        </Row>
      </main>
    </div>
  );
}
