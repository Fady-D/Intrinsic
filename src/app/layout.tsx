import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Intrinsic · Valuation workspace",
  description:
    "SEC source financials, transparent model estimates and interactive DCF research.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
