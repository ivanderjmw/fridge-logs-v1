# PowerShell script to run dev server with environment variables
# Usage: .\dev.ps1

Write-Host "Loading environment variables from .env.local..." -ForegroundColor Cyan

# Read .env.local file and set environment variables
if (Test-Path ".env.local") {
    Get-Content ".env.local" | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]*?)\s*=\s*(.+?)\s*$') {
            $name = $matches[1]
            $value = $matches[2]
            Set-Item -Path "env:$name" -Value $value
            Write-Host "  Set $name" -ForegroundColor Green
        }
    }
} else {
    Write-Host "ERROR: .env.local file not found!" -ForegroundColor Red
    Write-Host "Please copy .env.example to .env.local and fill in your Firebase credentials." -ForegroundColor Yellow
    exit 1
}

Write-Host "`nStarting development server..." -ForegroundColor Cyan
npm run dev
