<?php
// ===== CORS (DEV) =====
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];

if (in_array($origin, $allowed, true)) {
  header("Access-Control-Allow-Origin: $origin");
  header("Vary: Origin");
  header("Access-Control-Allow-Credentials: true");
  header("Access-Control-Allow-Headers: Content-Type");
  header("Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS");
}

// Preflight
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

// ===== Sesión =====
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

// ===== Router =====
$path = $_GET['path'] ?? '';

$map = [
  'health' => __DIR__ . '/../api/health.php',
  'auth'   => __DIR__ . '/../api/auth.php',
  'users'  => __DIR__ . '/../api/users.php',
  'appointments' => __DIR__ . '/../api/appointments.php',
  'appointment_history' => __DIR__ . '/../api/appointment_history.php',
];

if (!isset($map[$path])) {
  http_response_code(404);
  echo "Not Found";
  exit;
}

require $map[$path];
