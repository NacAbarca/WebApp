<?php
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/middleware.php';

$pdo = db();
require_auth();

$id = (int)($_GET['id'] ?? 0);
if ($id <= 0) json_error('id requerido', 422);

$me = $_SESSION['user'];
$role = $me['role'] ?? 'user';
$meId = (int)($me['id'] ?? 0);

$stmt = $pdo->prepare("SELECT user_id FROM appointments WHERE id=? LIMIT 1");
$stmt->execute([$id]);
$row = $stmt->fetch();
if (!$row) json_error('Cita no existe', 404);

if (!in_array($role, ['admin','staff'], true) && (int)$row['user_id'] !== $meId) {
  json_error('Prohibido', 403);
}

$q = $pdo->prepare("
  SELECT h.id, h.status, h.changed_by, h.changed_at, u.email AS changed_by_email
  FROM appointment_status_history h
  LEFT JOIN users u ON u.id = h.changed_by
  WHERE h.appointment_id=?
  ORDER BY h.changed_at ASC
");
$q->execute([$id]);

json_ok(['history' => $q->fetchAll()]);
