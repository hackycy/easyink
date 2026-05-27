using System;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using EasyInk.Engine.Models;
using EasyInk.Printer.UI.Controls;
using EasyInk.Printer.UI.Presenters;

namespace EasyInk.Printer.UI.Views;

internal sealed class PrintersView : ListPageViewBase<PrintersPresenter>
{
    private readonly PrintersPresenter _presenter;
    private readonly Button _testButton;
    private readonly ContextMenuStrip _testMenu;

    public PrintersView(PrintersPresenter presenter)
        : base(
            presenter,
            LangManager.Get("Printers_Tab"),
            new[]
            {
                new ListColumn(LangManager.Get("Printers_ColName"), 250),
                new ListColumn(LangManager.Get("Printers_ColDefault"), 50),
                new ListColumn(LangManager.Get("Printers_ColStatus"), 100),
                new ListColumn(LangManager.Get("Printers_ColOnline"), 60),
                new ListColumn(LangManager.Get("Printers_ColPaper"), 60)
            })
    {
        _presenter = presenter;

        _testMenu = new ContextMenuStrip();
        _testMenu.Items.Add(LangManager.Get("Printers_TestConnectivity"), null, (_, _) => RunTest(PrinterTestLevel.Connectivity));
        _testMenu.Items.Add(LangManager.Get("Printers_TestQuick"), null, (_, _) => RunTest(PrinterTestLevel.Quick));
        _testMenu.Items.Add(LangManager.Get("Printers_TestFull"), null, (_, _) => RunTest(PrinterTestLevel.Full));

        _testButton = UiFactory.CreateSecondaryButton(LangManager.Get("Printers_Test"), 84);
        _testButton.Click += (s, e) =>
        {
            _testMenu.Show(_testButton, 0, _testButton.Height);
        };
        ToolPanel.Controls.Add(_testButton);
    }

    private void RunTest(PrinterTestLevel level)
    {
        var selectedName = GetSelectedPrinterName();
        if (selectedName == null)
        {
            MessageBox.Show(
                LangManager.Get("Api_MissingPrinterName"),
                LangManager.Get("Common_Info"),
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        _testButton.Enabled = false;

        Task.Run(async () =>
        {
            try
            {
                var result = await _presenter.TestPrinterAsync(selectedName, level).ConfigureAwait(false);
                BeginInvoke((Action)(() => ShowTestResult(result)));
            }
            catch (Exception ex)
            {
                BeginInvoke((Action)(() =>
                {
                    MessageBox.Show(
                        $"{LangManager.Get("Printers_TestFailed")}: {ex.Message}",
                        LangManager.Get("Common_Error"),
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                }));
            }
            finally
            {
                BeginInvoke((Action)(() => _testButton.Enabled = true));
            }
        });
    }

    private string? GetSelectedPrinterName()
    {
        var listView = FindListView(this);
        if (listView?.SelectedItems.Count > 0)
            return listView.SelectedItems[0].Text;
        return null;
    }

    private static ListView? FindListView(Control control)
    {
        foreach (Control child in control.Controls)
        {
            if (child is ListView lv) return lv;
            var found = FindListView(child);
            if (found != null) return found;
        }
        return null;
    }

    private static void ShowTestResult(PrinterTestResult result)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"{LangManager.Get("Printers_ColName")}: {result.PrinterName}");
        sb.AppendLine($"{LangManager.Get("Printers_TestPath")}: {result.ResolvedPrintPath ?? "--"}");
        sb.AppendLine($"{LangManager.Get("Printers_TestStatus")}: {(result.Success ? LangManager.Get("Printers_TestSuccess") : LangManager.Get("Printers_TestFailed"))}");
        if (!result.Success && !string.IsNullOrEmpty(result.ErrorMessage))
            sb.AppendLine($"{LangManager.Get("Printers_TestError")}: {result.ErrorMessage}");

        var icon = result.Success ? MessageBoxIcon.Information : MessageBoxIcon.Warning;
        MessageBox.Show(sb.ToString(), LangManager.Get("Printers_TestResult"), MessageBoxButtons.OK, icon);
    }
}
