<?php

function request_json(): array {
  $raw = file_get_contents('php://input');
  if (!$raw) return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function client_ip(): string {
  return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

function user_agent(): string {
  return substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255);
}

function password_hash_bcrypt(string $plain): string {
  return password_hash($plain, PASSWORD_BCRYPT);
}

function password_verify_bcrypt(string $plain, string $hash): bool {
  return password_verify($plain, $hash);
}
