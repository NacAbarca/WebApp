<?php
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/security.php';
require_once __DIR__ . '/../includes/middleware.php';

require_role(['admin']);

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

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
    json_error('name, email y password son obligatorios', null, 422);
  }

  if (!in_array($role, ['admin','staff','user','interpreter'], true)) {
    json_error('role inválido', null, 422);
  }

  if (!in_array($status, ['active','inactive'], true)) {
    json_error('status inválido', null, 422);
  }

  $chk = $pdo->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
  $chk->execute([$email]);
  if ($chk->fetch()) json_error('Email ya existe', null, 409);

  $hash = password_hash_bcrypt($password);

  $ins = $pdo->prepare("
    INSERT INTO users (name, email, password_hash, role, status)
    VALUES (?,?,?,?,?)
  ");
  $ins->execute([$name, $email, $hash, $role, $status]);

  json_ok(['id' => (int)$pdo->lastInsertId()]);
}

if ($method === 'PUT') {
  $id = (int)($_GET['id'] ?? 0);
  if ($id <= 0) json_error('id requerido', null, 422);

  $body = request_json();

  $fields = [];
  $params = [];

  if (isset($body['name'])) {
    $fields[] = "name=?";
    $params[] = trim($body['name']);
  }

  if (isset($body['role'])) {
    if (!in_array($body['role'], ['admin','staff','user','interpreter'], true)) {
      json_error('role inválido', null, 422);
    }
    $fields[] = "role=?";
    $params[] = $body['role'];
  }

  if (isset($body['status'])) {
    if (!in_array($body['status'], ['active','inactive'], true)) {
      json_error('status inválido', null, 422);
    }
    $fields[] = "status=?";
    $params[] = $body['status'];
  }

  if (isset($body['password']) && $body['password'] !== '') {
    $fields[] = "password_hash=?";
    $params[] = password_hash_bcrypt($body['password']);
  }

  if (!$fields) json_error('Nada para actualizar', null, 422);

  $params[] = $id;
  $sql = "UPDATE users SET " . implode(',', $fields) . " WHERE id=?";
  $upd = $pdo->prepare($sql);
  $upd->execute($params);

  json_ok(['updated' => true]);
}

if ($method === 'DELETE') {
  $id = (int)($_GET['id'] ?? 0);
  if ($id <= 0) json_error('id requerido', null, 422);

  $meId = (int)($_SESSION['user']['id'] ?? 0);
  if ($meId === $id) {
    json_error('No puedes desactivar tu propio usuario', null, 400);
  }

  $upd = $pdo->prepare("UPDATE users SET status='inactive' WHERE id=?");
  $upd->execute([$id]);

  json_ok(['deleted' => true]);
}

json_error('Method Not Allowed', null, 405);
