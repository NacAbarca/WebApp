<?php
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/middleware.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$pdo = db();

// Solo staff/admin gestionan pacientes (ajusta si quieres que "user" pueda leer)
require_role(['admin','staff']);

function norm_str($v): ?string {
  $s = trim((string)$v);
  return $s === '' ? null : $s;
}

function allowed_sector(?string $v): ?string {
  if ($v === null) return null;
  $allowed = ['Verde','Azul','Rojo','Amarillo','Transversales','Patio central','Particular','Sin informado','Otros'];
  return in_array($v, $allowed, true) ? $v : null;
}

if ($method === 'GET') {
  // opcional: ?vigente=1
  $vigente = isset($_GET['vigente']) ? (int)$_GET['vigente'] : null;

  $sql = "SELECT
            id_paciente, created_at, updated_at, usuario, nombres,
            apellido_paterno, apellido_materno, fecha_nacimiento,
            contacto, email, direccion, comuna, region, vigente, sector,
            foto, observaciones
          FROM pacientes";
  $params = [];
  if ($vigente === 0 || $vigente === 1) {
    $sql .= " WHERE vigente = ?";
    $params[] = $vigente;
  }
  $sql .= " ORDER BY id_paciente DESC";

  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);

  json_ok(['patients' => $stmt->fetchAll()]);
}

if ($method === 'POST') {
  $body = request_json();

  $usuario = norm_str($body['usuario'] ?? null);
  $nombres = trim((string)($body['nombres'] ?? ''));
  $apellido_paterno = norm_str($body['apellido_paterno'] ?? null);
  $apellido_materno = norm_str($body['apellido_materno'] ?? null);
  $fecha_nacimiento = norm_str($body['fecha_nacimiento'] ?? null); // YYYY-MM-DD
  $contacto = norm_str($body['contacto'] ?? null);
  $email = norm_str(strtolower((string)($body['email'] ?? '')));
  $direccion = norm_str($body['direccion'] ?? null);
  $comuna = norm_str($body['comuna'] ?? null);
  $region = norm_str($body['region'] ?? null);
  $sector = norm_str($body['sector'] ?? null);
  $foto = norm_str($body['foto'] ?? null);
  $observaciones = norm_str($body['observaciones'] ?? null);

  if ($nombres === '') json_error('nombres es obligatorio', 422);

  if ($sector !== null) {
    $sectorOk = allowed_sector($sector);
    if (!$sectorOk) json_error('sector inválido', 422);
    $sector = $sectorOk;
  }

  // usuario único (si viene)
  if ($usuario !== null) {
    $chk = $pdo->prepare("SELECT id_paciente FROM pacientes WHERE usuario=? LIMIT 1");
    $chk->execute([$usuario]);
    if ($chk->fetch()) json_error('usuario ya existe', 409);
  }

  $ins = $pdo->prepare("
    INSERT INTO pacientes
      (usuario, nombres, apellido_paterno, apellido_materno, fecha_nacimiento,
       contacto, email, direccion, comuna, region, sector, foto, observaciones, vigente)
    VALUES
      (?,?,?,?,?,?,?,?,?,?,?,?,?,1)
  ");
  $ins->execute([
    $usuario,
    $nombres,
    $apellido_paterno,
    $apellido_materno,
    $fecha_nacimiento,
    $contacto,
    $email,
    $direccion,
    $comuna,
    $region,
    $sector ?? 'Sin informado',
    $foto,
    $observaciones,
  ]);

  json_ok(['id_paciente' => (int)$pdo->lastInsertId()]);
}

if ($method === 'PUT') {
  $id = (int)($_GET['id_paciente'] ?? $_GET['id'] ?? 0);
  if ($id <= 0) json_error('id_paciente requerido', 422);

  $body = request_json();

  $fields = [];
  $params = [];

  if (array_key_exists('usuario', $body)) {
    $usuario = norm_str($body['usuario']);
    if ($usuario !== null) {
      $chk = $pdo->prepare("SELECT id_paciente FROM pacientes WHERE usuario=? AND id_paciente<>? LIMIT 1");
      $chk->execute([$usuario, $id]);
      if ($chk->fetch()) json_error('usuario ya existe', 409);
    }
    $fields[] = "usuario=?";
    $params[] = $usuario;
  }

  if (array_key_exists('nombres', $body)) {
    $n = trim((string)$body['nombres']);
    if ($n === '') json_error('nombres no puede ser vacío', 422);
    $fields[] = "nombres=?";
    $params[] = $n;
  }

  $simpleMap = [
    'apellido_paterno' => 'apellido_paterno',
    'apellido_materno' => 'apellido_materno',
    'fecha_nacimiento' => 'fecha_nacimiento',
    'contacto' => 'contacto',
    'email' => 'email',
    'direccion' => 'direccion',
    'comuna' => 'comuna',
    'region' => 'region',
    'foto' => 'foto',
    'observaciones' => 'observaciones',
  ];

  foreach ($simpleMap as $k => $col) {
    if (array_key_exists($k, $body)) {
      $v = $body[$k];
      if ($k === 'email') $v = strtolower((string)$v);
      $fields[] = "$col=?";
      $params[] = norm_str($v);
    }
  }

  if (array_key_exists('sector', $body)) {
    $v = norm_str($body['sector']);
    if ($v !== null) {
      $ok = allowed_sector($v);
      if (!$ok) json_error('sector inválido', 422);
      $v = $ok;
    }
    $fields[] = "sector=?";
    $params[] = $v ?? 'Sin informado';
  }

  if (array_key_exists('vigente', $body)) {
    $vig = (int)$body['vigente'];
    $fields[] = "vigente=?";
    $params[] = ($vig === 1) ? 1 : 0;
  }

  if (!$fields) json_error('Nada para actualizar', 422);

  $params[] = $id;
  $sql = "UPDATE pacientes SET " . implode(',', $fields) . " WHERE id_paciente=?";
  $upd = $pdo->prepare($sql);
  $upd->execute($params);

  json_ok(['updated' => true]);
}

if ($method === 'DELETE') {
  // Soft delete: vigente=0 (no borramos para no romper FK)
  $id = (int)($_GET['id_paciente'] ?? $_GET['id'] ?? 0);
  if ($id <= 0) json_error('id_paciente requerido', 422);

  $upd = $pdo->prepare("UPDATE pacientes SET vigente=0 WHERE id_paciente=?");
  $upd->execute([$id]);

  json_ok(['deleted' => true]);
}

json_error('Method Not Allowed', 405);
