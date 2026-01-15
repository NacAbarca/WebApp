// frontend/src/services/api.js
const API_BASE = "http://127.0.0.1:8080/api.php";

export async function api(params = {}, options = {}) {
  const qs = new URLSearchParams();

  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      qs.set(k, String(v));
    }
  });

  const url = `${API_BASE}?${qs.toString()}`;

  const res = await fetch(url, {
    method: options.method || "GET",
    credentials: "include", // 🔴 OBLIGATORIO para sesión PHP
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();

  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Respuesta no JSON (${res.status}): ${text.slice(0, 120)}`);
  }

  if (!json || json.ok !== true) {
    throw new Error(json?.error?.message || "Error API");
  }

  return json.data;
}
