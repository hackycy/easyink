using EasyInk.Printer.UI.Presenters;

namespace EasyInk.Printer.UI.Views;

internal sealed class JobsView : ListPageViewBase<JobsPresenter>
{
    public JobsView(JobsPresenter presenter)
        : base(
            presenter,
            LangManager.Get("Jobs_Tab"),
            new[]
            {
                new ListColumn(LangManager.Get("Jobs_ColJobId"), 200),
                new ListColumn(LangManager.Get("Jobs_ColPrinter"), 150),
                new ListColumn(LangManager.Get("Jobs_ColStatus"), 100),
                new ListColumn(LangManager.Get("Jobs_ColCreatedTime"), 150),
                new ListColumn(LangManager.Get("Jobs_ColError"), 200)
            })
    {
    }
}
