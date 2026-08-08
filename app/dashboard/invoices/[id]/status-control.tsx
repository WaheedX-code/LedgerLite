"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const STATUSES = ["draft", "sent", "paid"] as const;

export default function StatusControl({
  invoiceId,
  currentStatus,
}: {
  invoiceId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [saving, setSaving] = useState(false);

  async function handleChange(next: string) {
    setSaving(true);
    const res = await fetch(`/api/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setSaving(false);
    if (res.ok) {
      setStatus(next);
      router.refresh();
    }
  }

  return (
    <select
      className="field-input w-auto font-mono text-xs uppercase"
      value={status}
      disabled={saving}
      onChange={(e) => handleChange(e.target.value)}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
