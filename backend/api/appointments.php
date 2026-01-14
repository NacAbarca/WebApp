<?php
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/security.php';
require_once __DIR__ . '/../includes/middleware.php';

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
require_auth();

$me = $_SESSION['user'];
$role = $me['role'] ?? 'user';
$meId = (int)($me['id'] ?? 0);

function can_manage_all(string $role): bool {
  return in_array($role, ['admin','staff'], true);
}
function valid_status(string $s): bool {
  return in_array($s, ['pending','confirmed','cancelled','no_show','done'], true);
}

if ($method === 'GET') {
  $from = $_GET['from'] ?? null; // YYYY-MM-DD
  $to   = $_GET['to'] ?? null;   // YYYY-MM-DD

  $where = [];
  $params = [];

  if ($from) { $where[] = "a.start_at >= ?"; $params[] = $from . " 00:00:00"; }
  if ($to)   { $where[] = "a.start_at <= ?"; $params[] = $to . " 23:59:59"; }

  if (!can_manage_all($role)) {
    $where[] = "a.user_id = ?";
    $params[] = $meId;
  } else {
    if (isset($_GET['user_id'])) {
      $where[] = "a.user_id = ?";
      $params[] = (int)$_GET['user_id'];
    }
  }

  $sql = "
    SELECT
      a.id, a.user_id, a.staff_id, a.start_at, a.end_at, a.status, a.notes, a.created_at,
      u.name AS user_name, u.email AS user_email,
      s.name AS staff_name, s.email AS staff_email
    FROM appointments a
    JOIN users u ON u.id = a.user_id
    LEFT JOIN users s ON s.id = a.staff_id
  ";
  if ($where) $sql .= " WHERE " . implode(" AND ", $where);
  $sql .= " ORDER BY a.start_at ASC";

  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  json_ok(['appointments' => $stmt->fetchAll()]);
}

if ($method === 'POST') {
  $body = request_json();

  $user_id = isset($body['user_id']) ? (int)$body['user_id'] : $meId;
  $staff_id = isset($body['staff_id']) ? (int)$body['staff_id'] : null;
  $start_at = trim($body['start_at'] ?? '');
  $end_at   = trim($body['end_at'] ?? '');
  $notes    = $body['notes'] ?? null;

  if ($start_at === '' || $end_at === '') json_error('start_at y end_at son obligatorios', 422);

  if (!can_manage_all($role) && $user_id !== $meId) json_error('Prohibido', 403);
  if (strtotime($end_at) <= strtotime($start_at)) json_error('end_at debe ser mayor que start_at', 422);

  $chk = $pdo->prepare("SELECT id FROM users WHERE id=? LIMIT 1");
  $chk->execute([$user_id]);
  if (!$chk->fetch()) json_error('user_id no existe', 404);

  if ($staff_id) {
    $chk2 = $pdo->prepare("SELECT id FROM users WHERE id=? LIMIT 1");
    $chk2->execute([$staff_id]);
    if (!$chk2->fetch()) json_error('staff_id no existe', 404);
  }

  $status = 'pending';

  $ins = $pdo->prepare("
    INSERT INTO appointments (user_id, staff_id, start_at, end_at, status, notes)
    VALUES (?,?,?,?,?,?)
  ");
  $ins->execute([$user_id, $staff_id, $start_at, $end_at, $status, $notes]);

  $id = (int)$pdo->lastInsertId();

  $h = $pdo->prepare("INSERT INTO appointment_status_history (appointment_id, status, changed_by) VALUES (?,?,?)");
  $h->execute([$id, $status, $meId]);

  json_ok(['id' => $id]);
}

if ($method === 'PUT') {
  $id = (int)($_GET['id'] ?? 0);
  if ($id <= 0) json_error('id requerido', 422);

  $body = request_json();

  $stmt = $pdo->prepare("SELECT * FROM appointments WHERE id=? LIMIT 1");
  $stmt->execute([$id]);
  $a = $stmt->fetch();
  if (!$a) json_error('Cita no existe', 404);

  if (!can_manage_all($role) && (int)$a['user_id'] !== $meId) json_error('Prohibido', 403);

  $fields = [];
  $params = [];

  $start_at = array_key_exists('start_at', $body) ? trim((string)$body['start_at']) : $a['start_at'];
  $end_at   = array_key_exists('end_at', $body)   ? trim((string)$body['end_at'])   : $a['end_at'];

  if (array_key_exists('start_at', $body)) { $fields[] = "start_at=?"; $params[] = $start_at; }
  if (array_key_exists('end_at', $body))   { $fields[] = "end_at=?";   $params[] = $end_at; }
  if (array_key_exists('notes', $body))    { $fields[] = "notes=?";    $params[] = $body['notes']; }

  if (can_manage_all($role) && array_key_exists('staff_id', $body)) {
    $fields[] = "staff_id=?";
    $params[] = $body['staff_id'] ? (int)$body['staff_id'] : null;
  }

  if (array_key_exists('status', $body)) {
    $newStatus = (string)$body['status'];
    if (!valid_status($newStatus)) json_error('status inválido', 422);
    if ($newStatus !== $a['status']) {
      $fields[] = "status=?";
      $params[] = $newStatus;

      $h = $pdo->prepare("INSERT INTO appointment_status_history (appointment_id, status, changed_by) VALUES (?,?,?)");
      $h->execute([$id, $newStatus, $meId]);
    }
  }

  if (!$fields) json_error('Nada para actualizar', 422);
  if (strtotime($end_at) <= strtotime($start_at)) json_error('end_at debe ser mayor que start_at', 422);

  $params[] = $id;
  $sql = "UPDATE appointments SET " . implode(',', $fields) . " WHERE id=?";
  $upd = $pdo->prepare($sql);
  $upd->execute($params);

  json_ok(['updated' => true]);
}

if ($method === 'DELETE') {
  $id = (int)($_GET['id'] ?? 0);
  if ($id <= 0) json_error('id requerido', 422);

  $stmt = $pdo->prepare("SELECT * FROM appointments WHERE id=? LIMIT 1");
  $stmt->execute([$id]);
  $a = $stmt->fetch();
  if (!$a) json_error('Cita no existe', 404);

  if (!can_manage_all($role) && (int)$a['user_id'] !== $meId) json_error('Prohibido', 403);

  $upd = $pdo->prepare("UPDATE appointments SET status='cancelled' WHERE id=?");
  $upd->execute([$id]);

  $h = $pdo->prepare("INSERT INTO appointment_status_history (appointment_id, status, changed_by) VALUES (?,?,?)");
  $h->execute([$id, 'cancelled', $meId]);

  json_ok(['deleted' => true]);
}

json_error('Method Not Allowed', 405);
