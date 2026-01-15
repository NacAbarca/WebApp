<?php
require __DIR__ . '/../includes/response.php';

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = [
  'http://127.0.0.1:8000',
  'http://localhost:8000',
];

if (in_array($origin, $allowed, true)) {
  header("Access-Control-Allow-Origin: $origin");
  header("Access-Control-Allow-Credentials: true");
  header("Access-Control-Allow-Headers: Content-Type");
  header("Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS");
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

$path = $_GET['path'] ?? '';

$routes = [
  'health' => __DIR__ . '/../api/health.php',
  'auth' => __DIR__ . '/../api/auth.php',
  'users' => __DIR__ . '/../api/users.php',
  'appointments' => __DIR__ . '/../api/appointments.php',
  'appointment_history' => __DIR__ . '/../api/appointment_history.php',
];

if (!isset($routes[$path])) {
  json_error('Not Found', ['path' => $path], 404);
}

require $routes[$path];
