<?php
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/security.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();

if ($method === 'POST' && $action === 'login') {
  $body = request_json();
  $email = strtolower(trim($body['email'] ?? ''));
  $password = (string)($body['password'] ?? '');

  if ($email === '' || $password === '') {
    json_error('Faltan credenciales', 422);
  }

  $pdo = db();

  $stmt = $pdo->prepare("SELECT id, name, email, password_hash, role, status FROM users WHERE email = ? LIMIT 1");
  $stmt->execute([$email]);
  $user = $stmt->fetch();

  $success = 0;
  $userId = $user['id'] ?? null;

  if (!$user) {
    // log intento
    $log = $pdo->prepare("INSERT INTO login_logs (user_id, email, ip, user_agent, success) VALUES (NULL, ?, ?, ?, 0)");
    $log->execute([$email, client_ip(), user_agent()]);
    json_error('Credenciales inválidas', 401);
  }

  if (($user['status'] ?? 'inactive') !== 'active') {
    $log = $pdo->prepare("INSERT INTO login_logs (user_id, email, ip, user_agent, success) VALUES (?, ?, ?, ?, 0)");
    $log->execute([$userId, $email, client_ip(), user_agent()]);
    json_error('Usuario inactivo', 403);
  }

  if (!password_verify_bcrypt($password, $user['password_hash'])) {
    $log = $pdo->prepare("INSERT INTO login_logs (user_id, email, ip, user_agent, success) VALUES (?, ?, ?, ?, 0)");
    $log->execute([$userId, $email, client_ip(), user_agent()]);
    json_error('Credenciales inválidas', 401);
  }

  // éxito
  $_SESSION['user'] = [
    'id' => (int)$user['id'],
    'name' => $user['name'],
    'email' => $user['email'],
    'role' => $user['role'],
  ];

  $log = $pdo->prepare("INSERT INTO login_logs (user_id, email, ip, user_agent, success) VALUES (?, ?, ?, ?, 1)");
  $log->execute([$userId, $email, client_ip(), user_agent()]);

  json_ok(['user' => $_SESSION['user']]);
}

if ($method === 'POST' && $action === 'logout') {
  $_SESSION = [];
  if (ini_get("session.use_cookies")) {
    $p = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $p["path"], $p["domain"], $p["secure"], $p["httponly"]);
  }
  session_destroy();
  json_ok(['logout' => true]);
}

if ($method === 'GET' && $action === 'me') {
  $me = $_SESSION['user'] ?? null;
  if (!$me) json_error('No autorizado', 401);
  json_ok(['user' => $me]);
}

json_error('Not Found', 404);
