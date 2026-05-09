param(
    [Parameter(Mandatory = $false)]
    [string]$Notes = "",

    [Parameter(Mandatory = $false)]
    [string]$Version = "",

    [Parameter(Mandatory = $false)]
    [string]$ApiBaseUrl = "https://api.bookkeeping.neobee.top",

    [Parameter(Mandatory = $false)]
    [string]$AdminUsername = "",

    [Parameter(Mandatory = $false)]
    [string]$AdminPassword = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Push-Location $ProjectRoot

try {
    # --- Step 1: Version ---
    if (-not $Version) {
        $pkg = Get-Content "$ProjectRoot\package.json" -Raw | ConvertFrom-Json
        $Version = $pkg.version
    }
    Write-Host "[1/5] Version: $Version" -ForegroundColor Yellow

    if ($Version -notmatch '^\d+\.\d+\.\d+$') {
        throw "Version '$Version' does not match X.Y.Z"
    }

    # --- Step 2: Credentials ---
    if (-not $AdminUsername) { $AdminUsername = Read-Host "Admin username" }
    if (-not $AdminPassword) {
        $secure = Read-Host "Admin password" -AsSecureString
        $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        $AdminPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }

    # --- Step 3: Build web ---
    Write-Host "[2/5] Building web assets..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }

    # --- Step 4: Zip dist ---
    Write-Host "[3/5] Packaging dist..." -ForegroundColor Yellow
    $BundlePath = "$ProjectRoot\dist-bundle-$Version.zip"
    if (Test-Path $BundlePath) { Remove-Item $BundlePath -Force }
    Compress-Archive -Path "$ProjectRoot\dist\*" -DestinationPath $BundlePath -Force
    $sizeKb = [math]::Round((Get-Item $BundlePath).Length / 1024, 1)
    Write-Host "       Bundle: $BundlePath ($sizeKb KB)" -ForegroundColor Gray

    # --- Step 5: Login ---
    Write-Host "[4/5] Authenticating..." -ForegroundColor Yellow
    $loginBody = @{ username = $AdminUsername; password = $AdminPassword } | ConvertTo-Json
    $loginResp = Invoke-RestMethod -Method Post -Uri "$ApiBaseUrl/auth/login" `
        -ContentType "application/json" -Body $loginBody
    if (-not $loginResp.success) { throw "Login failed: $($loginResp.message)" }
    $token = $loginResp.data.access_token
    if (-not $loginResp.data.user.is_admin) { throw "User is not admin" }

    # --- Step 6: Upload ---
    Write-Host "[5/5] Uploading release..." -ForegroundColor Yellow
    $uploadResp = & curl.exe --fail --silent --show-error `
        -H "Authorization: Bearer $token" `
        -F "version=$Version" `
        -F "changelog=$Notes" `
        -F "bundle=@$BundlePath" `
        "$ApiBaseUrl/app-updates/releases"
    if ($LASTEXITCODE -ne 0) { throw "Upload failed: $uploadResp" }
    $parsed = $uploadResp | ConvertFrom-Json
    if (-not $parsed.success) { throw "Publish failed: $($parsed.message)" }

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  PUBLISHED v$Version" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  URL:      $($parsed.data.url)" -ForegroundColor White
    Write-Host "  Checksum: $($parsed.data.checksum)" -ForegroundColor Gray
    Write-Host "  Size:     $([math]::Round($parsed.data.size / 1024, 1)) KB" -ForegroundColor Gray
    Write-Host ""

    Remove-Item $BundlePath -Force -ErrorAction SilentlyContinue
}
finally {
    Pop-Location
}
