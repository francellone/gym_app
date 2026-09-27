import { beforeEach, describe, expect, it, vi } from 'vitest'

const createSignedUrls = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({ createSignedUrls }) } },
}))

const { getAvatarUrl, cachedAvatarUrl, initialsOf, __resetAvatarCache } =
  await import('./avatarUrls')

describe('avatarUrls', () => {
  beforeEach(() => {
    __resetAvatarCache()
    createSignedUrls.mockReset()
  })

  it('agrupa los pedidos del mismo tick en un solo request y cachea', async () => {
    createSignedUrls.mockResolvedValue({
      data: [
        { path: 'a/1.webp', signedUrl: 'https://x/a' },
        { path: 'b/1.webp', error: 'Object not found', signedUrl: null },
      ],
      error: null,
    })
    const [a, b, a2] = await Promise.all([
      getAvatarUrl('a/1.webp'),
      getAvatarUrl('b/1.webp'),
      getAvatarUrl('a/1.webp'),
    ])
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
    expect(createSignedUrls.mock.calls[0][0]).toEqual(['a/1.webp', 'b/1.webp'])
    expect([a, b, a2]).toEqual(['https://x/a', null, 'https://x/a'])
    expect(cachedAvatarUrl('a/1.webp')).toBe('https://x/a')
    await getAvatarUrl('a/1.webp')
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
  })

  it('si falla la red devuelve null (iniciales) sin romper', async () => {
    createSignedUrls.mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await getAvatarUrl('c/1.webp')).toBeNull()
  })

  it('sin ruta no pide nada', async () => {
    expect(await getAvatarUrl(null)).toBeNull()
    expect(createSignedUrls).not.toHaveBeenCalled()
  })

  it('iniciales', () => {
    expect(initialsOf('ana maría lópez')).toBe('AM')
    expect(initialsOf('')).toBe('?')
  })
})
