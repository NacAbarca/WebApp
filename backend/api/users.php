<?php
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/security.php';
require_once __DIR__ . '/../includes/middleware.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$pdo = db();

// Solo admin
require_role(['admin']);

if ($method === 'GET') {
  $q = $pdo->query("SELECT id, name, email, role, status, created_at FROM users ORDER BY id DESC");
  json_ok(['users' => $q->fetchAll()]);
}

if ($method === 'POST') {
  $body = request_json();

  $name = trim($body['name'] ?? '');
  $email = strtolower(trim($body['email'] ?? ''));
  $role = $body['role'] ?? 'user';
  $status = $body['status'] ?? 'active';
  $password = (string)($body['password'] ?? '');

  if ($name === '' || $email === '' || $password === '') {
    json_error('name, email y password son obligatorios', 422);
  }

  if (!in_array($role, ['admin','staff','user'], true)) json_error('role inválido', 422);
  if (!in_array($status, ['active','inactive'], true)) json_error('status inválido', 422);

  $chk = $pdo->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
  $chk->execute([$email]);
  if ($chk->fetch()) json_error('Email ya existe', 409);

  $hash = password_hash_bcrypt($password);

  $ins = $pdo->prepare("INSERT INTO users (name, email, password_hash, role, status) VALUES (?,?,?,?,?)");
  $ins->execute([$name, $email, $hash, $role, $status]);

  json_ok(['id' => (int)$pdo->lastInsertId()]);
}

if ($method === 'PUT') {
  $id = (int)($_GET['id'] ?? 0);
  if ($id <= 0) json_error('id requerido', 422);

  $body = request_json();
  $name = trim($body['name'] ?? '');
  $role = $body['role'] ?? null;
  $status = $body['status'] ?? null;
  $password = isset($body['password']) ? (string)$body['password'] : null;

  $stmt = $pdo->prepare("SELECT id, email FROM users WHERE id=? LIMIT 1");
  $stmt->execute([$id]);
  $u = $stmt->fetch();
  if (!$u) json_error('Usuario no existe', 404);

  $fields = [];
  $params = [];

  if ($name !== '') { $fields[] = "name=?"; $params[] = $name; }
  if ($role !== null) {
    if (!in_array($role, ['admin','staff','user'], true)) json_error('role inválido', 422);
    $fields[] = "role=?"; $params[] = $role;
  }
  if ($status !== null) {
    if (!in_array($status, ['active','inactive'], true)) json_error('status inválido', 422);
    $fields[] = "status=?"; $params[] = $status;
  }
  if ($password !== null && $password !== '') {
    $fields[] = "password_hash=?";
    $params[] = password_hash_bcrypt($password);
  }

  if (!$fields) json_error('Nada para actualizar', 422);

  $params[] = $id;
  $sql = "UPDATE users SET " . implode(',', $fields) . " WHERE id=?";
  $upd = $pdo->prepare($sql);
  $upd->execute($params);

  json_ok(['updated' => true]);
}

// ✅ DELETE = soft delete (NO borrar físico)
if ($method === 'DELETE') {
  $id = (int)($_GET['id'] ?? 0);
  if ($id <= 0) json_error('id requerido', 422);

  $upd = $pdo->prepare("UPDATE users SET status='inactive' WHERE id=?");
  $upd->execute([$id]);

  json_ok(['deleted' => true, 'id' => $id]);
}

json_error('Method Not Allowed', null, 405);
