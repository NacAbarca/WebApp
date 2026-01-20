<?php
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/middleware.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$pdo = db();

// Solo staff/admin gestionan pacientes
require_role(['admin','staff']);

// Helpers
function to_int_or_null($v): ?int {
  if ($v === null || $v === '') return null;
  $n = (int)$v;
  return $n > 0 ? $n : null;
}

if ($method === 'GET') {
  // Búsqueda simple opcional: ?q=texto
  $q = trim((string)($_GET['q'] ?? ''));

  if ($q !== '') {
    $stmt = $pdo->prepare("
      SELECT
        id_paciente, run, usuario, nombres, apellido_paterno, apellido_materno,
        fecha_nacimiento, contacto, email, direccion, comuna, region,
        sector, vigente, foto, observaciones, created_at, updated_at
      FROM pacientes
      WHERE run LIKE ?
         OR nombres LIKE ?
         OR apellido_paterno LIKE ?
         OR apellido_materno LIKE ?
         OR email LIKE ?
      ORDER BY id_paciente DESC
      LIMIT 200
    ");
    $like = "%{$q}%";
    $stmt->execute([$like,$like,$like,$like,$like]);
    json_ok(['patients' => $stmt->fetchAll()]);
  }

  $stmt = $pdo->query("
    SELECT
      id_paciente, run, usuario, nombres, apellido_paterno, apellido_materno,
      fecha_nacimiento, contacto, email, direccion, comuna, region,
      sector, vigente, foto, observaciones, created_at, updated_at
    FROM pacientes
    ORDER BY id_paciente DESC
    LIMIT 200
  ");
  json_ok(['patients' => $stmt->fetchAll()]);
}

if ($method === 'POST') {
  $body = request_json();

  $run = strtoupper(trim((string)($body['run'] ?? '')));
  $usuario = trim((string)($body['usuario'] ?? ''));
  $nombres = trim((string)($body['nombres'] ?? ''));
  $apellido_paterno = trim((string)($body['apellido_paterno'] ?? ''));
  $apellido_materno = trim((string)($body['apellido_materno'] ?? ''));
  $fecha_nacimiento = $body['fecha_nacimiento'] ?? null; // YYYY-MM-DD
  $contacto = trim((string)($body['contacto'] ?? ''));
  $email = strtolower(trim((string)($body['email'] ?? '')));
  $direccion = trim((string)($body['direccion'] ?? ''));
  $comuna = trim((string)($body['comuna'] ?? ''));
  $region = trim((string)($body['region'] ?? ''));
  $sector = trim((string)($body['sector'] ?? 'Sin informado'));
  $vigente = isset($body['vigente']) ? (int)$body['vigente'] : 1;
  $foto = trim((string)($body['foto'] ?? ''));
  $observaciones = (string)($body['observaciones'] ?? null);

  if ($run === '') json_error('run es obligatorio', 422);
  if ($nombres === '') json_error('nombres es obligatorio', 422);

  $ins = $pdo->prepare("
    INSERT INTO pacientes
      (run, usuario, nombres, apellido_paterno, apellido_materno, fecha_nacimiento,
       contacto, email, direccion, comuna, region, sector, vigente, foto, observaciones)
    VALUES
      (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ");

  $ins->execute([
    $run,
    $usuario ?: null,
    $nombres,
    $apellido_paterno ?: null,
    $apellido_materno ?: null,
    $fecha_nacimiento ?: null,
    $contacto ?: null,
    $email ?: null,
    $direccion ?: null,
    $comuna ?: null,
    $region ?: null,
    $sector ?: 'Sin informado',
    $vigente ? 1 : 0,
    $foto ?: null,
    $observaciones
  ]);

  json_ok(['id_paciente' => (int)$pdo->lastInsertId()]);
}

if ($method === 'PUT') {
  $id = (int)($_GET['id_paciente'] ?? 0);
  if ($id <= 0) json_error('id_paciente requerido', 422);

  $body = request_json();

  $fields = [];
  $params = [];

  $map = [
    'run' => 'run',
    'usuario' => 'usuario',
    'nombres' => 'nombres',
    'apellido_paterno' => 'apellido_paterno',
    'apellido_materno' => 'apellido_materno',
    'fecha_nacimiento' => 'fecha_nacimiento',
    'contacto' => 'contacto',
    'email' => 'email',
    'direccion' => 'direccion',
    'comuna' => 'comuna',
    'region' => 'region',
    'sector' => 'sector',
    'vigente' => 'vigente',
    'foto' => 'foto',
    'observaciones' => 'observaciones',
  ];

  foreach ($map as $k => $col) {
    if (array_key_exists($k, $body)) {
      $fields[] = "{$col}=?";
      $v = $body[$k];

      if ($k === 'email') $v = strtolower(trim((string)$v));
      if (is_string($v)) $v = trim($v);
      if ($k === 'vigente') $v = ((int)$v) ? 1 : 0;

      $params[] = ($v === '') ? null : $v;
    }
  }

  if (!$fields) json_error('Nada para actualizar', 422);

  $params[] = $id;
  $sql = "UPDATE pacientes SET " . implode(',', $fields) . " WHERE id_paciente=?";
  $upd = $pdo->prepare($sql);
  $upd->execute($params);

  json_ok(['updated' => true]);
}

if ($method === 'DELETE') {
  $id = (int)($_GET['id_paciente'] ?? 0);
  if ($id <= 0) json_error('id_paciente requerido', 422);

  // Soft delete: vigente = 0
  $upd = $pdo->prepare("UPDATE pacientes SET vigente=0 WHERE id_paciente=?");
  $upd->execute([$id]);

  json_ok(['deleted' => true]);
}

json_error('Method Not Allowed', 405);
