import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const createSignedUrls = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({ createSignedUrls }) } },
}))

import { fitWithin } from './resizeImage'
import { buildExerciseImagePath } from './exerciseImageApi'
import { __resetExerciseImageCache } from './exerciseImageUrls'
import ExerciseThumb from './ExerciseThumb'

beforeEach(() => {
  __resetExerciseImageCache()
  createSignedUrls.mockReset()
})

describe('fitWithin', () => {
  it('achica al lado mayor sin deformar', () => {
    expect(fitWithin(4000, 3000, 800)).toEqual({ w: 800, h: 600 })
    expect(fitWithin(1080, 1920, 800)).toEqual({ w: 450, h: 800 })
  })
  it('nunca agranda', () => {
    expect(fitWithin(300, 200, 800)).toEqual({ w: 300, h: 200 })
  })
  it('tamaños inválidos → 0', () => {
    expect(fitWithin(0, 100)).toEqual({ w: 0, h: 0 })
  })
})

describe('buildExerciseImagePath', () => {
  it('carpeta = id del ejercicio, extensión según tipo', () => {
    expect(buildExerciseImagePath('ex1', { type: 'image/webp' }, 5)).toBe('ex1/5.webp')
    expect(buildExerciseImagePath('ex1', { type: 'image/jpeg' }, 5)).toBe('ex1/5.jpg')
  })
})

describe('ExerciseThumb', () => {
  it('sin imagen no dibuja nada', () => {
    const { container } = render(<ExerciseThumb path={null} name="Swing" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('si no se puede firmar, no queda ningún hueco', async () => {
    createSignedUrls.mockResolvedValue({ data: [{ path: 'a/1.webp', error: 'x' }], error: null })
    const { container } = render(<ExerciseThumb path="a/1.webp" name="Swing" />)
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('con imagen: miniatura que se abre a pantalla completa y se cierra', async () => {
    createSignedUrls.mockResolvedValue({
      data: [{ path: 'a/1.webp', signedUrl: 'https://x/1.webp' }],
      error: null,
    })
    const user = userEvent.setup()
    const parentClick = vi.fn()
    render(
      <div onClick={parentClick}>
        <ExerciseThumb path="a/1.webp" name="Swing" />
      </div>
    )
    const btn = await screen.findByRole('button', { name: /ver imagen de swing/i })
    await user.click(btn)
    expect(screen.getByRole('dialog', { name: 'Swing' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /cerrar imagen/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    // El toque no llega a la tarjeta (no la abre ni la cierra).
    expect(parentClick).not.toHaveBeenCalled()
  })

  it('pide todas las rutas del mismo momento en un solo pedido', async () => {
    createSignedUrls.mockResolvedValue({
      data: [
        { path: 'a/1.webp', signedUrl: 'https://x/1' },
        { path: 'b/2.webp', signedUrl: 'https://x/2' },
      ],
      error: null,
    })
    render(
      <>
        <ExerciseThumb path="a/1.webp" name="A" />
        <ExerciseThumb path="b/2.webp" name="B" />
      </>
    )
    await screen.findByRole('button', { name: /ver imagen de b/i })
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
  })
})
