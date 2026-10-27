import { describe, expect, it } from 'vitest'
import { pageRoute, versionLink } from './versioning'

describe('documentation version navigation', () => {
  const version = {
    id: '0.0',
    label: '0.0.x',
    base: '/easyink/docs/0.0/',
    pages: { '/': [], '/viewer/': ['print'], '/guide/start.html': ['install'] },
  }

  it.each([
    ['index.md', '/'],
    ['viewer/index.md', '/viewer/'],
    ['/viewer/', '/viewer/'],
    ['guide/start.md', '/guide/start.html'],
    ['/guide/start', '/guide/start.html'],
    ['guide/start.html', '/guide/start.html'],
  ])('normalizes %s to %s', (input, output) => {
    expect(pageRoute(input)).toBe(output)
  })

  it('keeps a matching page, query and anchor', () => {
    expect(versionLink(version, 'viewer/index.md', '?mode=preview', '#print')).toEqual({
      href: '/easyink/docs/0.0/viewer/?mode=preview#print',
      missing: false,
    })
  })

  it('drops unknown or invalid anchors without losing the query', () => {
    expect(versionLink(version, 'guide/start.md', '?a=1', '#unknown').href).toBe('/easyink/docs/0.0/guide/start.html?a=1')
    expect(versionLink(version, 'guide/start.md', '', '#%xx').href).toBe('/easyink/docs/0.0/guide/start.html')
  })

  it('decodes anchors when checking whether the target supports them', () => {
    expect(versionLink(version, 'viewer/', '', '#%70rint').href).toBe('/easyink/docs/0.0/viewer/#%70rint')
  })

  it('uses the selected series homepage for a missing page', () => {
    expect(versionLink(version, 'new-only.md', '?source=guide', '#example')).toEqual({
      href: '/easyink/docs/0.0/?source=guide',
      missing: true,
    })
  })
})
