<?php
// backend/includes/response.php

function json_response(bool $ok, $data = null, $error = null, int $status = 200): void {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode([
    'ok' => $ok,
    'data' => $data,
    'error' => $error
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

function json_ok($data = null, int $status = 200): void {
  json_response(true, $data, null, $status);
}

function json_error(string $message, $details = null, int $status = 400): void {
  json_response(false, null, [
    'message' => $message,
    'details' => $details
  ], $status);
}

