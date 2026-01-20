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
      a.id, a.user_id, a.id_paciente, a.start_at, a.end_at, a.status, a.notes,
      u.name AS user_name, u.email AS user_email,
      p.run AS paciente_rut, p.nombres AS paciente_nombres,
      p.apellido_paterno AS paciente_apellido_paterno, p.apellido_materno AS paciente_apellido_materno
    FROM appointments a
    JOIN users u ON u.id = a.user_id
    LEFT JOIN pacientes p ON p.id_paciente = a.id_paciente
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

  // 1️⃣ PRIMERO: leer JSON
  $body = request_json();

  // 2️⃣ Datos base
  $user_id  = isset($body['user_id']) ? (int)$body['user_id'] : $meId;
  $staff_id = isset($body['staff_id']) ? (int)$body['staff_id'] : null;

  $start_raw = (string)($body['start_at'] ?? '');
  $end_raw   = (string)($body['end_at'] ?? '');
  $notes     = $body['notes'] ?? null;

  $start_at = assert_dt(parse_dt($start_raw), 'start_at');
  $end_at   = assert_dt(parse_dt($end_raw), 'end_at');

  if (strtotime($end_at) <= strtotime($start_at)) {
    json_error('Start debe ser ANTES que End', 422);
  }

  // 3️⃣ Campos clínicos / atención (solo staff/admin)
  $attention_type = isset($body['attention_type']) ? trim((string)$body['attention_type']) : null;
  $sector_at      = isset($body['sector_at']) ? trim((string)$body['sector_at']) : null;
  $interpreter_id = isset($body['interpreter_id']) ? (int)$body['interpreter_id'] : null;

  if (!can_manage_all($role)) {
    if ($attention_type || $sector_at || $interpreter_id) {
      json_error('Solo staff/admin puede asignar atención/intérprete', 403);
    }
  }

  // 4️⃣ Validar intérprete
  if ($interpreter_id) {
    $chk = $pdo->prepare("SELECT id, status FROM users WHERE id=?");
    $chk->execute([$interpreter_id]);
    $i = $chk->fetch();
    if (!$i) json_error('Intérprete no existe', 404);
    if (($i['status'] ?? '') !== 'active') json_error('Intérprete inactivo', 422);
  }

  $created_by_staff_id = can_manage_all($role) ? $meId : null;

  // 5️⃣ INSERT FINAL
  $stmt = $pdo->prepare("
    INSERT INTO appointments
    (user_id, staff_id, start_at, end_at, status, notes,
     attention_type, sector_at, interpreter_id, created_by_staff_id)
    VALUES (?,?,?,?, 'pending', ?, ?, ?, ?, ?)
  ");

  $stmt->execute([
    $user_id,
    $staff_id,
    $start_at,
    $end_at,
    $notes,
    $attention_type,
    $sector_at,
    $interpreter_id,
    $created_by_staff_id
  ]);

  json_ok(['id' => (int)$pdo->lastInsertId()]);
}


if ($method === 'PUT') {

  $body = request_json();

  // nuevos campos (solo staff/admin)
  if (can_manage_all($role) && array_key_exists('attention_type', $body)) {
    $fields[] = "attention_type=?";
    $params[] = trim((string)$body['attention_type']);
  }

  if (can_manage_all($role) && array_key_exists('sector_at', $body)) {
    $fields[] = "sector_at=?";
    $params[] = trim((string)$body['sector_at']);
  }

  if (can_manage_all($role) && array_key_exists('interpreter_id', $body)) {
    $iid = (int)$body['interpreter_id'];
    if ($iid > 0) {
      $chkI = $pdo->prepare("SELECT id, status FROM users WHERE id=? LIMIT 1");
      $chkI->execute([$iid]);
      $i = $chkI->fetch();
      if (!$i) json_error('interpreter_id no existe', 404);
      if (($i['status'] ?? '') !== 'active') json_error('Intérprete está inactivo', 422);

      $fields[] = "interpreter_id=?";
      $params[] = $iid;
    } else {
      // Limpia el intérprete
      $fields[] = "interpreter_id=NULL";
    }
  }


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
