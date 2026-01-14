const BASE_URL = "http://127.0.0.1:8080";

export async function api(path, { method = "GET", body = null } = {}) {
  const url = `${BASE_URL}/api.php?${path}`;

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : null
  });

  const data = await res.json().catch(() => null);
  if (!data?.ok) throw new Error(data?.error?.message || "Error API");
  return data.data;
}
