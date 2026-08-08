"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = { description: string; quantity: number; unitPriceCents: number };

export default function NewInvoicePage() {
  const router = useRouter();
  const [clientName, setClientName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<Item[]>([
    { description: "", quantity: 1, unitPriceCents: 0 },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateItem(index: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Client-side check is a UX convenience only — the API route re-validates
    // everything with the same Zod schema. Never trust the client.
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName,
        dueDate: new Date(dueDate).toISOString(),
        items,
      }),
    });

    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not create invoice.");
      return;
    }
    const created = await res.json();
    router.push(`/dashboard/invoices/${created.id}`);
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-8 font-display text-2xl font-semibold">New invoice</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="field-label" htmlFor="clientName">
            Client name
          </label>
          <input
            id="clientName"
            className="field-input"
            required
            maxLength={200}
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="dueDate">
            Due date
          </label>
          <input
            id="dueDate"
            type="date"
            className="field-input"
            required
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        <div>
          <p className="field-label">Line items</p>
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_120px] gap-3">
                <input
                  aria-label="Description"
                  className="field-input"
                  placeholder="Description"
                  required
                  maxLength={200}
                  value={item.description}
                  onChange={(e) => updateItem(i, { description: e.target.value })}
                />
                <input
                  aria-label="Quantity"
                  type="number"
                  min={1}
                  className="field-input"
                  value={item.quantity}
                  onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                />
                <input
                  aria-label="Unit price (USD)"
                  type="number"
                  min={0}
                  step="0.01"
                  className="field-input"
                  value={item.unitPriceCents / 100}
                  onChange={(e) =>
                    updateItem(i, {
                      unitPriceCents: Math.round(Number(e.target.value) * 100),
                    })
                  }
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-3 text-sm text-forest"
            onClick={() =>
              setItems((prev) => [...prev, { description: "", quantity: 1, unitPriceCents: 0 }])
            }
          >
            + Add line item
          </button>
        </div>

        {error && <p className="text-sm text-rust">{error}</p>}

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Creating…" : "Create invoice"}
        </button>
      </form>
    </div>
  );
}
