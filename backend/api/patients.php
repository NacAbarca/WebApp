<?php
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/middleware.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$pdo = db();

// Solo staff/admin gestionan pacientes (ajusta si quieres que "user" lea)
require_role(['admin','staff']);

if ($method === 'GET') {
  $q = $pdo->query("SELECT id, full_name, email, phone, notes, created_at, updated_at
                    FROM patients
                    ORDER BY id DESC");
  json_ok(['patients' => $q->fetchAll()]);
}

if ($method === 'POST') {
  $body = request_json();

  $full_name = trim((string)($body['full_name'] ?? ''));
  $email = strtolower(trim((string)($body['email'] ?? '')));
  $phone = trim((string)($body['phone'] ?? ''));
  $notes = (string)($body['notes'] ?? null);

  if ($full_name === '') json_error('full_name es obligatorio', 422);

  $ins = $pdo->prepare("INSERT INTO patients (full_name, email, phone, notes)
                        VALUES (?,?,?,?)");
  $ins->execute([$full_name, $email ?: null, $phone ?: null, $notes]);

  json_ok(['id' => (int)$pdo->lastInsertId()]);
}

if ($method === 'PUT') {
  $id = (int)($_GET['id'] ?? 0);
  if ($id <= 0) json_error('id requerido', 422);

  $body = request_json();

  $fields = [];
  $params = [];

  if (array_key_exists('full_name', $body)) {
    $v = trim((string)$body['full_name']);
    if ($v === '') json_error('full_name no puede ser vacío', 422);
    $fields[] = "full_name=?";
    $params[] = $v;
  }

  if (array_key_exists('email', $body)) {
    $v = strtolower(trim((string)$body['email']));
    $fields[] = "email=?";
    $params[] = $v ?: null;
  }

  if (array_key_exists('phone', $body)) {
    $v = trim((string)$body['phone']);
    $fields[] = "phone=?";
    $params[] = $v ?: null;
  }

  if (array_key_exists('notes', $body)) {
    $fields[] = "notes=?";
    $params[] = $body['notes'];
  }

  if (!$fields) json_error('Nada para actualizar', 422);

  $params[] = $id;
  $sql = "UPDATE patients SET " . implode(',', $fields) . " WHERE id=?";
  $upd = $pdo->prepare($sql);
  $upd->execute($params);

  json_ok(['updated' => true]);
}

if ($method === 'DELETE') {
  $id = (int)($_GET['id'] ?? 0);
  if ($id <= 0) json_error('id requerido', 422);

  // Si tienes FK desde appointments -> patients, conviene no borrar duro.
  // Opción segura: soft delete (requiere columna status). Si no tienes, puedes bloquear:
  json_error('DELETE no habilitado (evita romper FK). Usa status/soft delete.', 405);
}

json_error('Method Not Allowed', 405);
