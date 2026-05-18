export interface MaterialToolbarAction {
  id: string
  label: string
  icon: string
  command: string
  disabled?: boolean
  danger?: boolean
}

export interface MaterialToolbarGroup {
  id: string
  actions: MaterialToolbarAction[]
}

export function materialToolbarDockStyle(
  node: { x: number, y: number },
  unit: string,
  offset = 2,
): Record<string, string> {
  return {
    position: 'absolute',
    left: `${node.x}${unit}`,
    top: `${node.y}${unit}`,
    transform: `translateY(calc(-100% - ${offset}${unit}))`,
    zIndex: '30',
    pointerEvents: 'auto',
  }
}

export function materialToolbarShellStyle(): Record<string, string> {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
    maxWidth: 'min(460px, calc(100vw - 32px))',
    padding: '4px',
    border: '1px solid rgba(15, 23, 42, 0.16)',
    borderRadius: '6px',
    background: 'var(--ei-bg-elevated, #fff)',
    boxShadow: '0 6px 18px rgba(15, 23, 42, 0.16)',
    color: 'var(--ei-text-primary, #1f2933)',
    boxSizing: 'border-box',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  }
}

export function materialToolbarTitleStyle(): Record<string, string> {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    height: '24px',
    padding: '0 6px',
    borderRadius: '4px',
    background: 'rgba(15, 23, 42, 0.06)',
    color: 'var(--ei-text-secondary, #52616b)',
    fontSize: '11px',
    fontWeight: '600',
    lineHeight: '1',
  }
}

export function materialToolbarGroupStyle(): Record<string, string> {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    padding: '1px',
    borderRadius: '4px',
    background: 'rgba(15, 23, 42, 0.035)',
  }
}

export function materialToolbarButtonStyle(disabled?: boolean, danger?: boolean): Record<string, string> {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    minWidth: '24px',
    padding: '0',
    border: '0',
    borderRadius: '4px',
    background: 'transparent',
    color: danger ? 'var(--ei-danger, #d92d20)' : 'var(--ei-text-primary, #1f2933)',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? '0.36' : '1',
    boxSizing: 'border-box',
  }
}

export function materialToolbarIconStyle(): Record<string, string> {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    pointerEvents: 'none',
  }
}
