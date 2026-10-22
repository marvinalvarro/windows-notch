[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$res = @()
Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -like 'BTHENUM\DEV_*' -or $_.InstanceId -like 'BTHLE\DEV_*' } | ForEach-Object {
  $c = (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName '{83DA6326-97A6-4088-9453-A1923F573B29} 15' -ErrorAction SilentlyContinue).Data
  if ($c -eq $true) {
    $b = (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName '{104EA319-6EE2-4701-BD47-8DDBF425BBC5} 2' -ErrorAction SilentlyContinue).Data
    $res += @{ name = "$($_.FriendlyName)"; battery = $b }
  }
}
ConvertTo-Json -Compress -InputObject @($res)