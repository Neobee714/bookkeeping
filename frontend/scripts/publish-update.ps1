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

    # Use Capgo's official zip command — produces a format compatible with
    # Android's Java unzip (avoids DEFLATED+EXT descriptor issues that break
    # zips made by PowerShell's Compress-Archive or .NET ZipArchive).
    npx @capgo/cli bundle zip `
        --path "$ProjectRoot\dist" `
        --name "dist-bundle-$Version.zip" `
        --no-code-check `
        com.neobee.bookkeeping
    if ($LASTEXITCODE -ne 0) { throw "capgo zip failed" }
    if (-not (Test-Path $BundlePath)) {
        throw "Expected bundle file not found: $BundlePath"
    }
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

    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls13

    Add-Type -AssemblyName System.Net.Http
    $httpHandler = New-Object System.Net.Http.HttpClientHandler
    $httpClient = New-Object System.Net.Http.HttpClient($httpHandler)
    $httpClient.Timeout = [TimeSpan]::FromMinutes(10)
    $httpClient.DefaultRequestHeaders.Authorization = `
        New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $token)

    $multipart = New-Object System.Net.Http.MultipartFormDataContent
    $multipart.Add((New-Object System.Net.Http.StringContent($Version)), "version")
    $multipart.Add((New-Object System.Net.Http.StringContent($Notes)), "changelog")

    $fileStream = [System.IO.File]::OpenRead($BundlePath)
    $fileContent = New-Object System.Net.Http.StreamContent($fileStream)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/zip")
    $multipart.Add($fileContent, "bundle", [System.IO.Path]::GetFileName($BundlePath))

    try {
        $response = $httpClient.PostAsync("$ApiBaseUrl/app-updates/releases", $multipart).GetAwaiter().GetResult()
        $uploadResp = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if (-not $response.IsSuccessStatusCode) {
            throw "Upload failed ($($response.StatusCode)): $uploadResp"
        }
    }
    finally {
        $fileStream.Dispose()
        $multipart.Dispose()
        $httpClient.Dispose()
    }

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
