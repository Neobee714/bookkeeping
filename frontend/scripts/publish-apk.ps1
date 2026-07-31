param(
    [Parameter(Mandatory = $false)]
    [string]$Version = "",

    [Parameter(Mandatory = $false)]
    [string]$ApkPath = "",

    [Parameter(Mandatory = $false)]
    [string]$Notes = "",

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

# --- Step 1: Locate APK ---
    if (-not $ApkPath) {
        $ApkPath = "$ProjectRoot\android\app\build\outputs\apk\release\app-release.apk"
    }
    if (-not (Test-Path $ApkPath)) {
        throw "APK not found: $ApkPath"
    }
    $ApkPath = (Resolve-Path $ApkPath).Path

    # --- Step 2: Version ---
    if (-not $Version) {
        if ($ApkPath -match "app-release-(\d+\.\d+\.\d+)\.apk$") {
            $Version = $Matches[1]
        }
        else {
            throw "Cannot infer version from APK name; pass -Version X.Y.Z"
        }
    }
    if ($Version -notmatch '^\d+\.\d+\.\d+$') {
        throw "Version '$Version' does not match X.Y.Z"
    }
    Write-Host "[1/4] APK: $ApkPath" -ForegroundColor Yellow
    Write-Host "       Version: $Version" -ForegroundColor Yellow

    # --- Step 3: Credentials ---
    if (-not $AdminUsername) { $AdminUsername = Read-Host "Admin username" }
    if (-not $AdminPassword) {
        $secure = Read-Host "Admin password" -AsSecureString
        $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        $AdminPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }

    Write-Host "[2/4] Authenticating..." -ForegroundColor Yellow
    $loginBody = @{ username = $AdminUsername; password = $AdminPassword } | ConvertTo-Json
    $loginResp = Invoke-RestMethod -Method Post -Uri "$ApiBaseUrl/auth/login" `
        -ContentType "application/json" -Body $loginBody
    if (-not $loginResp.success) { throw "Login failed: $($loginResp.message)" }
    $token = $loginResp.data.access_token
    if (-not $loginResp.data.user.is_admin) { throw "User is not admin" }

    # --- Step 4: Upload ---
    Write-Host "[3/4] Uploading APK release..." -ForegroundColor Yellow

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

    $fileStream = [System.IO.File]::OpenRead($ApkPath)
    $fileContent = New-Object System.Net.Http.StreamContent($fileStream)
    $fileContent.Headers.ContentType = `
        [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/vnd.android.package-archive")
    $multipart.Add($fileContent, "apk", [System.IO.Path]::GetFileName($ApkPath))

    try {
        $response = $httpClient.PostAsync("$ApiBaseUrl/app-updates/apk", $multipart).GetAwaiter().GetResult()
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
    Write-Host "  PUBLISHED APK v$Version" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  URL:      $($parsed.data.url)" -ForegroundColor White
    Write-Host "  Checksum: $($parsed.data.checksum)" -ForegroundColor Gray
    Write-Host "  Size:     $([math]::Round($parsed.data.size / 1024, 1)) KB" -ForegroundColor Gray
    Write-Host ""
