import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Intrinsic · Valuation workspace",
  description:
    "A transparent, interactive DCF research dashboard with fictional illustrative data.",
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
