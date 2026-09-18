import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kenza Dashboard",
  description: "Tableau de bord Kenza — messages WhatsApp, commandes et statistiques en temps réel.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
