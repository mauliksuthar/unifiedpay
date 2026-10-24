import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { AntdProvider } from "@/components/AntdProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "UnifiedPay — Phase 1",
  description: "Business card collection via third-party PG. Commission to UnifiedPay fee account.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Suspense fallback={null}>
          <AntdRegistry>
            <AntdProvider>{children}</AntdProvider>
          </AntdRegistry>
        </Suspense>
      </body>
    </html>
  );
}
