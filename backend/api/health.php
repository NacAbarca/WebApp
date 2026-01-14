<?php
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/db.php';

try {
  $pdo = db();
  $pdo->query("SELECT 1")->fetch();
  json_ok(['status' => 'up', 'db' => 'ok']);
} catch (Throwable $e) {
  json_error('DB error', 500, $e->getMessage());
}
