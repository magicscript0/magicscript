import { describe, expect, it } from 'vitest'
import { can, roleDescription, roleLabel } from './permissions'

describe('role permissions', () => {
  it('gives operators only operational access', () => {
    expect(can('operator', 'game.use')).toBe(true)
    expect(can('operator', 'history.view')).toBe(true)
    expect(can('operator', 'codes.manage')).toBe(false)
    expect(can('operator', 'general.manage')).toBe(false)
  })

  it('gives administrators control-plane management without changing the bridge role', () => {
    expect(can('admin', 'codes.manage')).toBe(true)
    expect(can('admin', 'social.manage')).toBe(true)
    expect(can('admin', 'display.manage')).toBe(true)
    expect(can('admin', 'game.use')).toBe(true)
  })

  it('labels each supported role clearly', () => {
    expect(roleLabel('super_admin')).toBe('SUPER ADMIN')
    expect(roleLabel('admin')).toBe('ADMIN')
    expect(roleLabel('operator')).toBe('OPERATOR')
    expect(roleDescription('operator')).toMatch(/game console/i)
  })
})
