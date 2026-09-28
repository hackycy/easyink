import 'core-js/stable'

if (!Element.prototype.replaceChildren) {
  Object.defineProperty(Element.prototype, 'replaceChildren', {
    configurable: true,
    writable: true,
    value(this: Element, ...nodes: Array<Node | string>): void {
      const fragment = this.ownerDocument.createDocumentFragment()
      for (const node of nodes) {
        fragment.appendChild(
          typeof node === 'string'
            ? this.ownerDocument.createTextNode(node)
            : node,
        )
      }
      while (this.firstChild)
        this.removeChild(this.firstChild)
      this.appendChild(fragment)
    },
  })
}
