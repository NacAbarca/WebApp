// frontend/src/services/api.js
const API_BASE = "http://127.0.0.1:8080/api.php";

/**
 * API wrapper (compatible)
 * Uso recomendado:
 *   api({ path:"auth", action:"me" })
 *   api({ path:"patients" }, { method:"POST", body:{...} })
 *
 * Compat legacy:
 *   api("auth", "me")
 */
export async function api(a = {}, b = {}, c = undefined) {
  let params = {};
  let options = {};

  // ---- Firma legacy: api("auth","me", options) ----
  if (typeof a === "string") {
    params.path = a;
    if (typeof b === "string" && b) params.action = b;
    if (b && typeof b === "object" && !Array.isArray(b)) Object.assign(params, b);
    options = (c && typeof c === "object") ? c : {};
  } else {
    // ---- Firma actual: api({path, action, ...}, options) ----
    params = (a && typeof a === "object") ? a : {};
    options = (b && typeof b === "object") ? b : {};
  }

  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  });

  const res = await fetch(`${API_BASE}?${qs.toString()}`, {
    method: options.method || "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } 
    catch { throw new Error(`Respuesta no JSON (${res.status}): ${text.slice(0, 180)}`); }

  if (!json?.ok) throw new Error(json?.error?.message || "Error API");
  return json.data;
}
