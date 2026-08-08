import type { Config } from "tailwindcss";

// Design direction: "the physical ledger book" — ruled lines, tabular numerals,
// paper-and-ink palette. See README "Design notes" for rationale.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAF9F4",
        ink: "#1B2430",
        rule: "#D8D3C7",
        forest: "#3F6259", // paid / positive
        amber: "#C98A3E", // pending
        rust: "#B4483A", // overdue / destructive
      },
      fontFamily: {
        display: ["var(--font-source-serif)", "serif"],
        body: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
