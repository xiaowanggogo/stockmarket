# stockmarket 一键启动脚本
# 用法: 在项目根目录运行 .\start.ps1
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "`n=== stockmarket 一键启动 ===" -ForegroundColor Cyan

# 1. 释放可能被占用的端口
foreach ($port in @(8000, 3000)) {
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($conn) {
        Write-Host "端口 $port 被占用，释放中..." -ForegroundColor Yellow
        $conn | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
            Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Milliseconds 500
    }
}

# 2. 启动后端（新窗口，便于看日志）
Write-Host "启动后端 FastAPI (:8000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ROOT'; python -m uvicorn web.backend.app:app --port 8000"

# 3. 等待后端就绪（最多 30 秒）
Write-Host "等待后端就绪..." -ForegroundColor Gray
$backendReady = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        Invoke-RestMethod "http://127.0.0.1:8000/health" -ErrorAction Stop | Out-Null
        $backendReady = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $backendReady) {
    Write-Host "后端启动超时，请检查后端窗口日志。" -ForegroundColor Red
} else {
    Write-Host "后端就绪 OK" -ForegroundColor Green
}

# 4. 启动前端（新窗口）
Write-Host "启动前端 Next.js (:3000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ROOT\web\frontend'; npm run dev"

# 5. 等待前端就绪（最多 30 秒）
Write-Host "等待前端就绪..." -ForegroundColor Gray
$frontendReady = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        (Invoke-WebRequest "http://127.0.0.1:3000/" -UseBasicParsing -ErrorAction Stop) | Out-Null
        $frontendReady = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $frontendReady) {
    Write-Host "前端启动超时，请检查前端窗口日志。" -ForegroundColor Red
} else {
    Write-Host "前端就绪 OK" -ForegroundColor Green
}

# 6. 打开浏览器
if ($backendReady -and $frontendReady) {
    Write-Host "打开浏览器 http://localhost:3000 ..." -ForegroundColor Green
    Start-Process "http://localhost:3000"
    Write-Host "`n启动完成！两个服务窗口已打开，关闭它们即可停止服务。`n" -ForegroundColor Cyan
} else {
    Write-Host "`n部分服务未就绪，请检查对应窗口的日志。`n" -ForegroundColor Yellow
}
