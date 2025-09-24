# Start the Video Processing Pipeline

Write-Host "🚀 Starting Video Processing Pipeline..." -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "🐳 Checking Docker status..." -ForegroundColor Yellow
$dockerStatus = docker info 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Docker is running" -ForegroundColor Green

# Check for port conflicts
Write-Host ""
Write-Host "🔍 Checking for port conflicts..." -ForegroundColor Yellow
$portsToCheck = @(3001, 3002, 3003, 6380)
$conflictPorts = @()

foreach ($port in $portsToCheck) {
    $connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connection) {
        $conflictPorts += $port
    }
}

if ($conflictPorts.Count -gt 0) {
    Write-Host "⚠️  Port conflicts detected on: $($conflictPorts -join ', ')" -ForegroundColor Yellow
    Write-Host "📋 Current port usage:" -ForegroundColor Cyan
    netstat -an | findstr LISTENING | findstr "3001\|3002\|3003\|6380"
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne 'y') {
        exit 1
    }
}
Write-Host "✅ Ports available" -ForegroundColor Green

# Build and start services
Write-Host ""
Write-Host "🏗️  Building and starting services..." -ForegroundColor Yellow
docker-compose up -d --build

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "🎉 Video Processing Pipeline is now running!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📱 Access Points:" -ForegroundColor Cyan
    Write-Host "   🌐 Web Interface:    http://localhost:3001" -ForegroundColor Blue
    Write-Host "   📤 Upload Service:   http://localhost:3002" -ForegroundColor Blue
    Write-Host "   ⚙️  Worker API:       http://localhost:3003" -ForegroundColor Blue
    Write-Host "   🗄️  Redis:           localhost:6380" -ForegroundColor Blue
    Write-Host ""
    Write-Host "💾 RAM Usage (approx):" -ForegroundColor Cyan
    Write-Host "   Frontend:     40MB" -ForegroundColor Blue
    Write-Host "   Upload:       50MB" -ForegroundColor Blue
    Write-Host "   Worker:      120MB" -ForegroundColor Blue
    Write-Host "   Redis:        30MB" -ForegroundColor Blue
    Write-Host "   Total:       240MB" -ForegroundColor Green
    Write-Host ""
    Write-Host "🔧 Useful Commands:" -ForegroundColor Cyan
    Write-Host "   View logs:     docker-compose logs -f" -ForegroundColor Blue
    Write-Host "   Stop services: docker-compose down" -ForegroundColor Blue
    Write-Host "   Restart:       docker-compose restart" -ForegroundColor Blue
    Write-Host ""
    
    # Wait a bit and check service health
    Write-Host "⏳ Waiting for services to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
    
    Write-Host "🏥 Health Check:" -ForegroundColor Cyan
    
    # Check each service
    $services = @(
        @{Name="Frontend"; URL="http://localhost:3001/health"},
        @{Name="Upload Service"; URL="http://localhost:3002/health"},
        @{Name="Processing Worker"; URL="http://localhost:3003/health"}
    )
    
    foreach ($service in $services) {
        try {
            $response = Invoke-WebRequest -Uri $service.URL -TimeoutSec 5 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                Write-Host "   ✅ $($service.Name): Healthy" -ForegroundColor Green
            } else {
                Write-Host "   ⚠️  $($service.Name): Unhealthy" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "   ❌ $($service.Name): Not responding" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Host "🎬 Ready to process videos! Open http://localhost:3001 to get started!" -ForegroundColor Green
    
    # Ask if user wants to open browser
    $openBrowser = Read-Host "Open web interface in browser? (y/n)"
    if ($openBrowser -eq 'y') {
        Start-Process "http://localhost:3001"
    }
    
} else {
    Write-Host ""
    Write-Host "❌ Failed to start services. Check the logs:" -ForegroundColor Red
    Write-Host "   docker-compose logs" -ForegroundColor Blue
}