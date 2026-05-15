try {
  $result = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/udesc/heatmap?startDate=2026-04-10&endDate=2026-04-30' -TimeoutSec 20
  Write-Output "=== RESPONSE ==="
  Write-Output ($result | ConvertTo-Json -Depth 10)
} catch {
  Write-Output "ERROR: $_"
}
