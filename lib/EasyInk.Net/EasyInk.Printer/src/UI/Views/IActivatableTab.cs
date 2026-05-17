using System;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace EasyInk.Printer.UI.Views;

internal interface IActivatableTab : IDisposable
{
    string Title { get; }
    Control View { get; }
    Task ActivateAsync();
}
