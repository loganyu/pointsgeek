"use client";

import { useState, useEffect } from "react";

interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export default function SettingsPage() {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [newKeyName, setNewKeyName] = useState("Default");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKeys();
  }, []);

  async function fetchKeys() {
    const res = await fetch("/api/extension/token");
    if (res.ok) setKeys(await res.json());
    setLoading(false);
  }

  async function generateKey() {
    const res = await fetch("/api/extension/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName }),
    });
    if (res.ok) {
      const data = await res.json();
      setGeneratedKey(data.key);
      fetchKeys();
    }
  }

  async function revokeKey(id: string) {
    await fetch(`/api/extension/token?id=${id}`, { method: "DELETE" });
    fetchKeys();
  }

  return (
    <main className="max-w-2xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Settings</h1>
        <a href="/dashboard" className="text-sm text-blue-600 hover:underline">
          Dashboard
        </a>
      </div>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Extension API Keys</h2>
        <p className="text-sm text-gray-500 mb-4">
          Generate an API key and paste it into the Chrome extension to sync
          your balances.
        </p>

        <div className="flex gap-2 mb-4">
          <input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name"
            className="border rounded-lg px-3 py-2 text-sm flex-1"
          />
          <button
            onClick={generateKey}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
          >
            Generate Key
          </button>
        </div>

        {generatedKey && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-sm font-medium text-yellow-800 mb-2">
              Copy this key now — it won't be shown again:
            </p>
            <code className="text-xs bg-yellow-100 p-2 rounded block break-all select-all">
              {generatedKey}
            </code>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-gray-400">No active API keys.</p>
        ) : (
          <div className="divide-y border rounded-lg">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{key.name}</p>
                  <p className="text-xs text-gray-400">
                    {key.prefix}... &middot; Created{" "}
                    {new Date(key.createdAt).toLocaleDateString()}
                    {key.lastUsedAt &&
                      ` · Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`}
                  </p>
                </div>
                <button
                  onClick={() => revokeKey(key.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
