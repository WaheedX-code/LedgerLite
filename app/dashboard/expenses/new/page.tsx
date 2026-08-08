"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewExpensePage() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [incurredAt, setIncurredAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description,
        amountCents: Math.round(Number(amount) * 100),
        category,
        incurredAt: new Date(incurredAt).toISOString(),
      }),
    });

    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not log expense.");
      return;
    }
    router.push("/dashboard/expenses");
  }

  return (
    <div className="max-w-md">
      <h1 className="mb-8 font-display text-2xl font-semibold">Log expense</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="field-label" htmlFor="description">
            Description
          </label>
          <input
            id="description"
            className="field-input"
            required
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="amount">
            Amount (USD)
          </label>
          <input
            id="amount"
            type="number"
            min={0}
            step="0.01"
            className="field-input"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="category">
            Category
          </label>
          <input
            id="category"
            className="field-input"
            required
            maxLength={100}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="incurredAt">
            Date incurred
          </label>
          <input
            id="incurredAt"
            type="date"
            className="field-input"
            required
            value={incurredAt}
            onChange={(e) => setIncurredAt(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-rust">{error}</p>}

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Saving…" : "Log expense"}
        </button>
      </form>
    </div>
  );
}
