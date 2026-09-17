import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kenza",
  description: "Kenza - WhatsApp e-commerce agent",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
