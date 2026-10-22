Add-Type @"
using System.Runtime.InteropServices;
public class K { [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, int flags, int extra); }
"@
while (($l = [Console]::In.ReadLine()) -ne $null) {
  $vk = 0
  switch ($l.Trim()) { 'play' { $vk = 0xB3 } 'next' { $vk = 0xB0 } 'prev' { $vk = 0xB1 } }
  if ($vk -ne 0) { [K]::keybd_event($vk, 0, 0, 0); [K]::keybd_event($vk, 0, 2, 0) }
}