using EasyInk.Printer.UI.Presenters;

namespace EasyInk.Printer.UI.Views;

internal sealed class PrintersView : ListPageViewBase<PrintersPresenter>
{
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
    }
}
