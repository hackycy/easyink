using System.Collections.Generic;
using System.Linq;

namespace EasyInk.Printer.UI.Presenters;

internal sealed class ListViewRow
{
    public ListViewRow(params string[] values)
    {
        Values = values.ToList();
    }

    public IReadOnlyList<string> Values { get; }
}
