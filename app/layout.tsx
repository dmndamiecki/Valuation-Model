import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SME DCF Valuation Model",
  description: "Private company valuation MVP using DCF, WACC, bridge and sensitivity analysis.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
