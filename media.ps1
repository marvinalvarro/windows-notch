[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
function GetArt($p) {
  try {
    if (-not $p.Thumbnail) { return '' }
    $rs = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    $st = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($rs)
    $ms = New-Object System.IO.MemoryStream
    $st.CopyTo($ms)
    return [Convert]::ToBase64String($ms.ToArray())
  } catch { return '' }
}
$mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$propType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$mgr = Await ($mgrType::RequestAsync()) $mgrType
$lastKey = ''; $artSent = $true; $tries = 0
while ($true) {
  try {
    $s = $mgr.GetCurrentSession()
    if ($s) {
      $p = Await ($s.TryGetMediaPropertiesAsync()) $propType
      $pb = $s.GetPlaybackInfo(); $tl = $s.GetTimelineProperties()
      $key = "$($p.Title)|$($p.Artist)"
      if ($key -ne $lastKey) { $lastKey = $key; $artSent = $false; $tries = 0 }
      $o = @{ title = "$($p.Title)"; artist = "$($p.Artist)"; album = "$($p.AlbumTitle)"; status = [int]$pb.PlaybackStatus; pos = [math]::Round($tl.Position.TotalSeconds, 1); dur = [math]::Round(($tl.EndTime - $tl.StartTime).TotalSeconds, 1) }
      if (-not $artSent -and $tries -lt 6) { $tries++; $a = GetArt $p; if ($a) { $o.art = $a; $artSent = $true } }
    } else { $o = @{ status = 0; title = ''; artist = '' } }
    [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress))
  } catch { [Console]::Out.WriteLine('{"status":0,"title":"","artist":""}') }
  Start-Sleep -Milliseconds 1000
}