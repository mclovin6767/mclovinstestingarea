// Native print bridge (C2). Receives raw ESC/POS bytes from the renderer and spools them to a
// Windows printer via the print spooler — so a bill prints silently on any installed printer
// without WebUSB. Windows-only (the target); no native node module, so electron-builder stays
// simple: it shells out to PowerShell, which P/Invokes winspool.drv (the standard RawPrint trick).
const { ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const { writeFile, unlink } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

// Writes a temp file's bytes to a named printer as RAW. Resolves the default printer when the name
// is blank. Kept as a script we drop in the temp dir at runtime so it works packaged (inside asar)
// and in dev alike.
const RAW_PRINT_PS = String.raw`
param([Parameter(Mandatory=$false)][string]$PrinterName, [Parameter(Mandatory=$true)][string]$FilePath)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($PrinterName)) {
  $PrinterName = (Get-CimInstance -Class Win32_Printer -Filter "Default = True" -ErrorAction SilentlyContinue).Name
  if ([string]::IsNullOrWhiteSpace($PrinterName)) { throw "No printer name provided and no default printer is set." }
}
$src = @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class QrDinesRawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DOCINFOW { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOW pDocInfo);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
  public static void Send(string printerName, string filePath) {
    byte[] bytes = File.ReadAllBytes(filePath);
    IntPtr h;
    if (!OpenPrinter(printerName, out h, IntPtr.Zero)) throw new Exception("OpenPrinter failed for '" + printerName + "' (win32 " + Marshal.GetLastWin32Error() + ")");
    try {
      DOCINFOW di = new DOCINFOW(); di.pDocName = "QR Dines Receipt"; di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, ref di)) throw new Exception("StartDocPrinter failed (win32 " + Marshal.GetLastWin32Error() + ")");
      try {
        if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter failed");
        int written;
        if (!WritePrinter(h, bytes, bytes.Length, out written)) throw new Exception("WritePrinter failed");
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
"@
Add-Type -TypeDefinition $src -Language CSharp
[QrDinesRawPrint]::Send($PrinterName, $FilePath)
`;

let scriptPathPromise = null;
function ensureScript() {
  if (!scriptPathPromise) {
    const scriptPath = path.join(os.tmpdir(), 'qrdines-rawprint.ps1');
    scriptPathPromise = writeFile(scriptPath, RAW_PRINT_PS, 'utf8').then(() => scriptPath);
  }
  return scriptPathPromise;
}

function runPowerShell(scriptPath, printerName, filePath) {
  return new Promise((resolve, reject) => {
    const ps = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-PrinterName', printerName, '-FilePath', filePath],
      { windowsHide: true }
    );
    let stderr = '';
    ps.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    ps.on('error', reject);
    ps.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim() || `powershell exited with code ${code}`))));
  });
}

function registerPrintingIpc(getWindow) {
  ipcMain.handle('printers:list', async () => {
    const win = getWindow();
    if (!win) return [];
    try {
      const printers = await win.webContents.getPrintersAsync();
      return printers.map((p) => ({ name: p.name, displayName: p.displayName, isDefault: p.isDefault }));
    } catch {
      return [];
    }
  });

  ipcMain.handle('print:raw', async (_event, args) => {
    const printerName = (args && args.printerName) || '';
    const base64 = (args && args.base64) || '';
    if (process.platform !== 'win32') {
      return { ok: false, error: 'Native raw printing is implemented for Windows only.' };
    }
    if (!base64) {
      return { ok: false, error: 'Nothing to print.' };
    }

    const dataPath = path.join(os.tmpdir(), `qrdines-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.bin`);
    try {
      await writeFile(dataPath, Buffer.from(base64, 'base64'));
      const scriptPath = await ensureScript();
      await runPowerShell(scriptPath, printerName, dataPath);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : String(error) };
    } finally {
      unlink(dataPath).catch(() => {});
    }
  });
}

module.exports = { registerPrintingIpc };
