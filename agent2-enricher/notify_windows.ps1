param(
    [string]$Title = "Central Shopee",
    [string]$Message = "Tarefa finalizada com sucesso!",
    [string]$Type = "Info"
)

try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
    Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue

    $balloon = New-Object System.Windows.Forms.NotifyIcon
    $balloon.Icon = [System.Drawing.SystemIcons]::Information
    $balloon.BalloonTipTitle = $Title
    $balloon.BalloonTipText = $Message

    switch ($Type.ToLower()) {
        "error" { $balloon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Error }
        "warning" { $balloon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Warning }
        default { $balloon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info }
    }

    $balloon.Visible = $true
    $balloon.ShowBalloonTip(5000)
    
    # Também emite o som padrão de notificação do Windows
    [System.Media.SystemSounds]::Asterisk.Play()

    Start-Sleep -Milliseconds 800
    $balloon.Dispose()
} catch {
    # Silencioso se não houver suporte de UI
}
