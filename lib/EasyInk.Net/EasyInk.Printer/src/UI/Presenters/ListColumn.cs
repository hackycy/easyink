namespace EasyInk.Printer.UI.Presenters;

internal sealed class ListColumn
{
    public ListColumn(string header, int width)
    {
        Header = header;
        Width = width;
    }

    public string Header { get; }
    public int Width { get; }
}
