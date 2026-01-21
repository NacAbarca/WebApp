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

if ($method === 'GET' && $action === 'me') {
    if (!isset($_SESSION['user'])) {
        json_ok(['user' => null]);
    }
    json_ok(['user' => $_SESSION['user']]);
}

if ($method === 'POST' && $action === 'login') {
    $body = request_json();
    $email = $body['email'] ?? '';
    $password = $body['password'] ?? '';

    if (!$email || !$password) {
        json_error('Email y password requeridos', 422);
    }

    $stmt = $pdo->prepare("SELECT * FROM users WHERE email=? LIMIT 1");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password'])) {
        json_error('Credenciales inválidas', 401);
    }

    if ($user['status'] !== 'active') {
        json_error('Usuario inactivo', 403);
    }

    unset($user['password']);
    $_SESSION['user'] = $user;

    json_ok(['user' => $user]);
}

if ($method === 'POST' && $action === 'logout') {
    session_destroy();
    json_ok(true);
}


json_error('Not Found', 404);
