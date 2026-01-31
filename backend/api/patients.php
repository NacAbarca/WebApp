<?php

require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/middleware.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$pdo = db();

// Solo staff/admin gestionan pacientes
require_role(['admin','staff']);

function request_json() {
  $raw = file_get_contents('php://input');
  $data = json_decode($raw, true);
  if (!is_array($data)) json_error('JSON inválido', 400);
  return $data;
}
function norm_str($v) {
  if ($v === null) return null;
  $s = trim((string)$v);
  return $s === '' ? null : $s;
}

/**
 * GET /patients?vigente=1
 */
if ($method === 'GET') {
  $vigente = isset($_GET['vigente']) ? (int)$_GET['vigente'] : null;

  $sql = "SELECT * FROM pacientes";
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

/**
 * POST /patients
 * body: columnas iguales a MySQL (id_paciente PK varchar)
 */

if ($method === 'POST') {
  $body = request_json();

  $id_paciente = norm_str($body['id_paciente'] ?? null);
  $usuario = norm_str($body['usuario'] ?? null);
  $nombres = trim((string)($body['nombres'] ?? ''));

  if (!$id_paciente) json_error('id_paciente es obligatorio', 422);
  if ($nombres === '') json_error('nombres es obligatorio', 422);

  // validar PK única
  $chk = $pdo->prepare("SELECT 1 FROM pacientes WHERE id_paciente=? LIMIT 1");
  $chk->execute([$id_paciente]);
  if ($chk->fetchColumn()) {
    json_error('id_paciente ya existe', 409);
  }

  $stmt = $pdo->prepare("
    INSERT INTO pacientes (
      id_paciente, usuario, nombres, apellido_paterno, apellido_materno,
      fecha_nacimiento, edad, porcentaje_discapacidad, condiciones,
      nacionalidad, genero, establecimiento, ampersand_flag,
      contacto, email, direccion, comuna, region, provincia,
      vigente, sector, foto, observaciones
    ) VALUES (
      ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
    )
  ");

  $stmt->execute([
    $id_paciente,
    $usuario,
    $nombres,
    norm_str($body['apellido_paterno'] ?? null),
    norm_str($body['apellido_materno'] ?? null),
    norm_str($body['fecha_nacimiento'] ?? null),
    (int)($body['edad'] ?? 0),
    (int)($body['porcentaje_discapacidad'] ?? 0),
    norm_str($body['condiciones'] ?? null),
    norm_str($body['nacionalidad'] ?? null),
    norm_str($body['genero'] ?? null),
    norm_str($body['establecimiento'] ?? null),
    (int)($body['ampersand_flag'] ?? 0),
    norm_str($body['contacto'] ?? null),
    norm_str($body['email'] ?? null),
    norm_str($body['direccion'] ?? null),
    norm_str($body['comuna'] ?? null),
    norm_str($body['region'] ?? null),
    norm_str($body['provincia'] ?? null),
    (int)($body['vigente'] ?? 1),
    norm_str($body['sector'] ?? 'Sin informado'),
    norm_str($body['foto'] ?? null),
    norm_str($body['observaciones'] ?? null),
  ]);

  json_ok(['id_paciente' => $id_paciente]);
}

/* PUT */
if ($method === 'PUT') {
  $id_paciente = norm_str($_GET['id_paciente'] ?? null);
  if (!$id_paciente) json_error('Falta id_paciente', 422);

  $body = request_json();

  $stmt = $pdo->prepare("
    UPDATE pacientes SET
      usuario=?, nombres=?, apellido_paterno=?, apellido_materno=?,
      fecha_nacimiento=?, edad=?, porcentaje_discapacidad=?, condiciones=?,
      nacionalidad=?, genero=?, establecimiento=?, ampersand_flag=?,
      contacto=?, email=?, direccion=?, comuna=?, region=?, provincia=?,
      vigente=?, sector=?, foto=?, observaciones=?
    WHERE id_paciente=?
    LIMIT 1
  ");

  $stmt->execute([
    norm_str($body['usuario'] ?? null),
    trim((string)$body['nombres']),
    norm_str($body['apellido_paterno'] ?? null),
    norm_str($body['apellido_materno'] ?? null),
    norm_str($body['fecha_nacimiento'] ?? null),
    (int)($body['edad'] ?? 0),
    (int)($body['porcentaje_discapacidad'] ?? 0),
    norm_str($body['condiciones'] ?? null),
    norm_str($body['nacionalidad'] ?? null),
    norm_str($body['genero'] ?? null),
    norm_str($body['establecimiento'] ?? null),
    (int)($body['ampersand_flag'] ?? 0),
    norm_str($body['contacto'] ?? null),
    norm_str($body['email'] ?? null),
    norm_str($body['direccion'] ?? null),
    norm_str($body['comuna'] ?? null),
    norm_str($body['region'] ?? null),
    norm_str($body['provincia'] ?? null),
    (int)($body['vigente'] ?? 1),
    norm_str($body['sector'] ?? 'Sin informado'),
    norm_str($body['foto'] ?? null),
    norm_str($body['observaciones'] ?? null),
    $id_paciente
  ]);

  json_ok(['id_paciente' => $id_paciente]);
}

// Si llegas aquí y no manejas GET en este archivo, responde:
json_error('Método no soportado', 405);