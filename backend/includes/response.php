<?php
function json_ok($data = null): void {
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['ok' => true, 'data' => $data, 'error' => null], JSON_UNESCAPED_UNICODE);
  exit;
}

function json_error(string $message, int $code = 400, $details = null): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode([
    'ok' => false,
    'data' => null,
    'error' => ['message' => $message, 'details' => $details]
  ], JSON_UNESCAPED_UNICODE);
  exit;
}
