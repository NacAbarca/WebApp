<?php
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/security.php';
require_once __DIR__ . '/../includes/middleware.php';

require_auth();

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$me = $_SESSION['user'];
$role = $me['role'];
$meId = (int)$me['id'];

function can_manage_all(string $role): bool {
  return in_array($role, ['admin','staff'], true);
}

function parse_dt(string $raw): ?string {
  $raw = trim($raw);
  if ($raw === '') return null;

  $formats = [
    'd-m-Y H:i',
    'd-m-Y H:i:s',
    'Y-m-d H:i',
    'Y-m-d H:i:s',
    'Y-m-d\TH:i',
    'Y-m-d\TH:i:s'
  ];

  foreach ($formats as $f) {
    $dt = DateTime::createFromFormat($f, $raw);
    if ($dt) return $dt->format('Y-m-d H:i:s');
  }
  return null;
}

function assert_dt(string $raw, string $field): string {
  $dt = parse_dt($raw);
  if (!$dt) json_error("Formato inválido en $field (d-m-Y H:i)", null, 422);
  return $dt;
}

function assert_interpreter(?int $id, PDO $pdo): ?int {
  if (!$id) return null;
  $q = $pdo->prepare("
    SELECT id FROM users
    WHERE id=? AND role='interpreter' AND status='active'
    LIMIT 1
  ");
  $q->execute([$id]);
  if (!$q->fetch()) {
    json_error('Intérprete inválido o inactivo', null, 422);
  }
  return $id;
}

if ($method === 'GET') {
  $sql = "
    SELECT
      a.*,
      u.name AS user_name,
      u.email AS user_email,
      i.name AS interpreter_name,
      i.email AS interpreter_email
    FROM appointments a
    JOIN users u ON u.id = a.user_id
    LEFT JOIN users i ON i.id = a.interpreter_id
  ";

  $params = [];
  if (!can_manage_all($role)) {
    $sql .= " WHERE a.user_id = ?";
    $params[] = $meId;
  }

  $sql .= " ORDER BY a.start_at ASC";

  $st = $pdo->prepare($sql);
  $st->execute($params);
  json_ok(['appointments' => $st->fetchAll()]);
}

if ($method === 'POST') {
  $body = request_json();

  $user_id = (int)($body['user_id'] ?? $meId);
  if (!can_manage_all($role) && $user_id !== $meId) {
    json_error('Prohibido', null, 403);
  }

  $start_at = assert_dt($body['start_at'] ?? '', 'start_at');
  $end_at   = assert_dt($body['end_at'] ?? '', 'end_at');

  if (strtotime($end_at) <= strtotime($start_at)) {
    json_error('Start debe ser ANTES que End', null, 422);
  }

  $interpreter_id = assert_interpreter(
    isset($body['interpreter_id']) ? (int)$body['interpreter_id'] : null,
    $pdo
  );

  $notes = $body['notes'] ?? null;
  $created_by_staff_id = can_manage_all($role) ? $meId : null;

  $ins = $pdo->prepare("
    INSERT INTO appointments
      (user_id, interpreter_id, created_by_staff_id, start_at, end_at, status, notes)
    VALUES (?,?,?,?,?,'pending',?)
  ");

  $ins->execute([
    $user_id,
    $interpreter_id,
    $created_by_staff_id,
    $start_at,
    $end_at,
    $notes
  ]);

  json_ok(['id' => (int)$pdo->lastInsertId()]);
}

if ($method === 'PUT') {
  $id = (int)($_GET['id'] ?? 0);
  if ($id <= 0) json_error('id requerido', null, 422);

  $body = request_json();

  $fields = [];
  $params = [];

  if (isset($body['interpreter_id'])) {
    $iid = assert_interpreter((int)$body['interpreter_id'], $pdo);
    $fields[] = "interpreter_id=?";
    $params[] = $iid;
  }

  if (isset($body['notes'])) {
    $fields[] = "notes=?";
    $params[] = $body['notes'];
  }

  if (!$fields) json_error('Nada para actualizar', null, 422);

  $params[] = $id;
  $sql = "UPDATE appointments SET " . implode(',', $fields) . " WHERE id=?";
  $upd = $pdo->prepare($sql);
  $upd->execute($params);

  json_ok(['updated' => true]);
}

json_error('Method Not Allowed', null, 405);
