$conns = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($conns) {
    foreach ($conn in $conns) {
        $processId = $conn.OwningProcess
        if ($processId -gt 0) {
            Write-Host "Found PID: $processId on port 3000"
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
            Write-Host "Process $processId killed"
        }
    }
} else {
    Write-Host "Port 3000 is free"
}
Start-Sleep -Seconds 2
$check = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if (-not $check) {
    Write-Host "Confirmed: port 3000 is now free"
}
