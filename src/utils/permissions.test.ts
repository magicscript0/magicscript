import { describe, expect, it } from 'vitest'
import { can, roleDescription, roleLabel } from './permissions'

describe('role permissions', () => {
  it('gives operators only operational access', () => {
    expect(can('operator', 'game.use')).toBe(true)
    expect(can('operator', 'history.view')).toBe(true)
    expect(can('operator', 'codes.manage')).toBe(false)
    expect(can('operator', 'access.manage')).toBe(false)
    expect(can('operator', 'general.manage')).toBe(false)
  })

  it('gives administrators control-plane management without changing the bridge role', () => {
    expect(can('admin', 'codes.manage')).toBe(true)
    expect(can('admin', 'access.manage')).toBe(true)
    expect(can('admin', 'social.manage')).toBe(true)
    expect(can('admin', 'display.manage')).toBe(true)
    expect(can('admin', 'game.use')).toBe(true)
    expect(can('super_admin', 'access.manage')).toBe(true)
  })

  it('restricts the monitoring center to administrator roles', () => {
    expect(can('super_admin', 'security.view')).toBe(true)
    expect(can('admin', 'security.view')).toBe(true)
    expect(can('operator', 'security.view')).toBe(false)
  })

  it('labels each supported role clearly in Arabic (values unchanged)', () => {
    expect(roleLabel('super_admin')).toBe('المدير الرئيسي')
    expect(roleLabel('admin')).toBe('المدير')
    expect(roleLabel('operator')).toBe('المشغّل')
    expect(roleDescription('operator')).toMatch(/وحدة التحكم باللعبة/)
  })
})
