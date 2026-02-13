<?php
$file = "../data/epaileak.json";

$data = json_decode(file_get_contents($file), true);

$id = $_POST["id"];
$value = $_POST["value"];

$data[$id] = $value;

file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT));

echo "ok";
?>
