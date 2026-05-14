# Step 1: Kill existing process on port 3000
Write-Host "=== Freeing port 3000 ==="
$conns = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($conns) {
    foreach ($conn in $conns) {
        $processId = $conn.OwningProcess
        if ($processId -gt 0) {
            Write-Host "Killing PID: $processId"
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }
}
Start-Sleep -Seconds 2

# Step 2: Start the API service
Write-Host "=== Starting API service ==="
Set-Location D:\kefumonitor\apps\api
$process = Start-Process -FilePath node -ArgumentList "dist\main" -NoNewWindow -PassThru -RedirectStandardOutput "api-out-2.log" -RedirectStandardError "api-err-2.log"
Write-Host "Started node process with PID: $($process.Id)"
$process.Id | Out-File -FilePath D:\kefumonitor\apps\api\server.pid -Force

# Step 3: Wait for it to be ready
Write-Host "Waiting for service to start..."
$maxWait = 15
for ($i = 1; $i -le $maxWait; $i++) {
    Start-Sleep -Seconds 1
    $check = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
    if ($check) {
        Write-Host "Service is ready on http://localhost:3000"
        Write-Host "API base URL: http://localhost:3000/api/v1"
        exit 0
    }
    Write-Host "  waiting... ($i/$maxWait)"
}

# Check logs if still not ready
Write-Host "ERROR: Service did not start within $maxWait seconds"
Write-Host "Checking logs..."
if (Test-Path "D:\kefumonitor\apps\api\api-out-2.log") {
    Write-Host "--- STDOUT ---"
    Get-Content "D:\kefumonitor\apps\api\api-out-2.log" -Tail 20
}
if (Test-Path "D:\kefumonitor\apps\api\api-err-2.log") {
    Write-Host "--- STDERR ---"
    Get-Content "D:\kefumonitor\apps\api\api-err-2.log" -Tail 20
}
exit 1
