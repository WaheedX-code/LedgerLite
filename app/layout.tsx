import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Source_Serif_4, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  weight: ["500", "600", "700"],
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "LedgerLite",
  description: "Invoicing and expenses, kept plainly.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body
          className={`${sourceSerif.variable} ${inter.variable} ${jetbrainsMono.variable} font-body bg-paper text-ink antialiased`}
        >
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
