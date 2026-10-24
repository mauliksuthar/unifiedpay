"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Spin } from "antd";
import { DashboardShell } from "@/components/DashboardShell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("up_token")) router.replace("/login");
    else setReady(true);
  }, [router]);

  return (
    <>
      <div hidden={!ready}>
        <DashboardShell>{children}</DashboardShell>
      </div>
      {ready ? null : (
        <div className="boot-screen">
          <Spin size="large" />
          <p>Checking login…</p>
        </div>
      )}
    </>
  );
}
