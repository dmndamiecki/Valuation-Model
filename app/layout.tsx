import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Valuation Workbench",
  description: "KRS-first private company valuation workbench for Polish SME analysis.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
