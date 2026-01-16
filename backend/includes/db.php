<?php
require_once __DIR__ . '/env.php';

function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;

  $root = dirname(__DIR__, 2); // webapp-citas/
  $env = env_load($root . '/.env');

  $host = $env['DB_HOST'] ?? '127.0.0.1';
  $port = $env['DB_PORT'] ?? '3306';
  $name = $env['DB_NAME'] ?? 'webapp_citas';
  $user = $env['DB_USER'] ?? 'root';
  $pass = $env['DB_PASS'] ?? '';

  $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
  $pdo = new PDO($dsn, $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);

  return $pdo;
}
