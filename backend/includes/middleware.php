<?php
require_once __DIR__ . '/response.php';

function require_auth(): void {
  if (session_status() !== PHP_SESSION_ACTIVE) session_start();
  if (empty($_SESSION['user'])) json_error('No autorizado', 401);
}

function require_role(array $roles): void {
  require_auth();
  $role = $_SESSION['user']['role'] ?? null;
  if (!in_array($role, $roles, true)) json_error('Prohibido', 403);
}

// Helpers de conveniencia (evitan errores "undefined function require_admin")
function require_admin(): void {
  require_role(['admin']);
}

function require_staff(): void {
  require_role(['staff', 'admin']);
}
