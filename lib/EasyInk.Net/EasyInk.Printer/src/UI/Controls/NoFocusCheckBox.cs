using System.Windows.Forms;

namespace EasyInk.Printer.UI.Controls;

public class NoFocusCheckBox : CheckBox
{
    protected override bool ShowFocusCues => false;
}
