using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace PrecisionTallyTray
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                bool createdNew;
                using (Mutex mutex = new Mutex(true, "PrecisionTallyTray_SingleInstance_Mutex", out createdNew))
                {
                    if (!createdNew)
                    {
                        MessageBox.Show("Precision Tally Tray is already running in the system tray (check taskbar overflow ^ arrow).", 
                                        "Precision Tally Sync", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        return;
                    }

                    Application.EnableVisualStyles();
                    Application.SetCompatibleTextRenderingDefault(false);
                    Application.Run(new TrayApplicationContext());
                }
            }
            catch (Exception ex)
            {
                File.AppendAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "tray-crash.log"),
                    DateTime.Now.ToString() + " CRASH: " + ex.ToString() + Environment.NewLine);
                MessageBox.Show("Tray Error: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    public class TrayApplicationContext : ApplicationContext
    {
        private NotifyIcon trayIcon;
        private ContextMenuStrip contextMenu;
        private ToolStripMenuItem statusMenuItem;
        private ToolStripMenuItem autoStartMenuItem;
        private Process connectorProcess;
        private System.Windows.Forms.Timer healthCheckTimer;

        private readonly string appDir;
        private readonly string exePath;
        private readonly string logPath;
        private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string AppRunName = "PrecisionTallyTray";

        public TrayApplicationContext()
        {
            appDir = AppDomain.CurrentDomain.BaseDirectory;
            exePath = Path.Combine(appDir, "TallyConnector.exe");
            logPath = Path.Combine(appDir, "logs", "connector.log");

            InitializeTray();
            StartConnector();

            if (!IsAutoStartEnabled())
            {
                ToggleAutoStart(true);
            }

            healthCheckTimer = new System.Windows.Forms.Timer();
            healthCheckTimer.Interval = 10000;
            healthCheckTimer.Tick += delegate { HealthCheck(); };
            healthCheckTimer.Start();
        }

        private void InitializeTray()
        {
            contextMenu = new ContextMenuStrip();

            statusMenuItem = new ToolStripMenuItem("● Status: Starting...")
            {
                Enabled = false,
                Font = new Font(SystemFonts.DefaultFont, FontStyle.Bold)
            };
            contextMenu.Items.Add(statusMenuItem);
            contextMenu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem openLogsItem = new ToolStripMenuItem("📄 Open Logs", null, delegate { OpenLogFile(); });
            contextMenu.Items.Add(openLogsItem);

            ToolStripMenuItem openFolderItem = new ToolStripMenuItem("📁 Open Folder", null, delegate { OpenFolder(); });
            contextMenu.Items.Add(openFolderItem);

            ToolStripMenuItem restartItem = new ToolStripMenuItem("🔄 Restart Sync", null, delegate { RestartConnector(); });
            contextMenu.Items.Add(restartItem);

            contextMenu.Items.Add(new ToolStripSeparator());

            autoStartMenuItem = new ToolStripMenuItem("🚀 Start with Windows")
            {
                CheckOnClick = true,
                Checked = IsAutoStartEnabled()
            };
            autoStartMenuItem.Click += delegate { ToggleAutoStart(autoStartMenuItem.Checked); };
            contextMenu.Items.Add(autoStartMenuItem);

            contextMenu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem exitItem = new ToolStripMenuItem("❌ Exit Sync", null, delegate { ExitApplication(); });
            contextMenu.Items.Add(exitItem);

            trayIcon = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                ContextMenuStrip = contextMenu,
                Text = "Precision Press ERP - Tally Sync (Running)",
                Visible = true
            };

            trayIcon.DoubleClick += delegate { OpenLogFile(); };

            trayIcon.ShowBalloonTip(3000, "Precision Tally Sync Active", 
                "Tally Connector is running silently in the background.", ToolTipIcon.Info);
        }

        private void StartConnector()
        {
            try
            {
                if (!File.Exists(exePath))
                {
                    statusMenuItem.Text = "● Status: TallyConnector.exe Not Found";
                    return;
                }

                StopConnector();

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = exePath,
                    WorkingDirectory = appDir,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };

                connectorProcess = Process.Start(psi);

                if (connectorProcess != null && !connectorProcess.HasExited)
                {
                    statusMenuItem.Text = "● Status: Running (PID: " + connectorProcess.Id + ")";
                    trayIcon.Text = "Precision Tally Sync (PID: " + connectorProcess.Id + ")";
                }
                else
                {
                    statusMenuItem.Text = "● Status: Failed to Start";
                }
            }
            catch (Exception ex)
            {
                statusMenuItem.Text = "● Status: Error Starting";
                File.AppendAllText(Path.Combine(appDir, "tray-crash.log"),
                    DateTime.Now.ToString() + " StartConnector: " + ex.ToString() + Environment.NewLine);
            }
        }

        private void StopConnector()
        {
            try
            {
                if (connectorProcess != null && !connectorProcess.HasExited)
                {
                    connectorProcess.Kill();
                    connectorProcess.WaitForExit(3000);
                }
            }
            catch { }

            try
            {
                Process[] processes = Process.GetProcessesByName("TallyConnector");
                foreach (Process p in processes)
                {
                    try
                    {
                        if (p.MainModule != null && string.Equals(p.MainModule.FileName, exePath, StringComparison.OrdinalIgnoreCase))
                        {
                            p.Kill();
                        }
                    }
                    catch { }
                }
            }
            catch { }
        }

        private void RestartConnector()
        {
            trayIcon.ShowBalloonTip(2000, "Restarting...", "Restarting Tally Connector process...", ToolTipIcon.Info);
            StartConnector();
        }

        private void HealthCheck()
        {
            if (connectorProcess == null || connectorProcess.HasExited)
            {
                statusMenuItem.Text = "● Status: Stopped (Auto-Restarting)";
                StartConnector();
            }
            else
            {
                statusMenuItem.Text = "● Status: Running (PID: " + connectorProcess.Id + ")";
            }
        }

        private void OpenLogFile()
        {
            try
            {
                if (File.Exists(logPath))
                {
                    Process.Start("notepad.exe", "\"" + logPath + "\"");
                }
                else
                {
                    MessageBox.Show("Log file has not been created yet:\n" + logPath, 
                                    "Logs", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Could not open logs: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void OpenFolder()
        {
            try
            {
                Process.Start("explorer.exe", "\"" + appDir + "\"");
            }
            catch { }
        }

        private bool IsAutoStartEnabled()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RunKeyPath, false))
                {
                    if (key != null)
                    {
                        object val = key.GetValue(AppRunName);
                        return val != null;
                    }
                }
            }
            catch { }
            return false;
        }

        private void ToggleAutoStart(bool enable)
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RunKeyPath, true))
                {
                    if (key != null)
                    {
                        if (enable)
                        {
                            string myExe = Application.ExecutablePath;
                            key.SetValue(AppRunName, "\"" + myExe + "\"");
                        }
                        else
                        {
                            key.DeleteValue(AppRunName, false);
                        }
                    }
                }
            }
            catch { }
        }

        private void ExitApplication()
        {
            if (healthCheckTimer != null)
            {
                healthCheckTimer.Stop();
            }
            StopConnector();

            if (trayIcon != null)
            {
                trayIcon.Visible = false;
                trayIcon.Dispose();
            }

            Application.Exit();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                if (healthCheckTimer != null)
                {
                    healthCheckTimer.Dispose();
                }
                if (trayIcon != null)
                {
                    trayIcon.Dispose();
                }
                if (contextMenu != null)
                {
                    contextMenu.Dispose();
                }
            }
            base.Dispose(disposing);
        }
    }
}
