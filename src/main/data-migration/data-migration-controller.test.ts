import { describe, expect, it, vi } from 'vitest'
import { listRuntimeThreadsForMigration, publicMigrationError } from './data-migration-controller'

describe('data migration runtime thread inventory', () => {
  it('requests the complete supported inventory without exceeding the route limit', async () => {
    const runtimeFetch = vi.fn(async () => new Response(JSON.stringify({
      threads: [{
        id: 'thr_side_archived',
        title: 'Side history',
        workspace: '/workspace',
        status: 'archived',
        relation: 'side',
        createdAt: '2026-07-16T00:00:00.000Z',
        updatedAt: '2026-07-16T00:01:00.000Z'
      }]
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    await expect(listRuntimeThreadsForMigration(runtimeFetch)).resolves.toEqual([
      expect.objectContaining({ id: 'thr_side_archived', status: 'archived', relation: 'side' })
    ])
    expect(runtimeFetch).toHaveBeenCalledOnce()
    expect(runtimeFetch).toHaveBeenCalledWith('/v1/threads?include_archived=true&include=side')
  })
})

describe('data migration public IPC errors', () => {
  it('provides a stable code, destination impact, and next action without credentials or stack lines', () => {
    const message = publicMigrationError(
      new Error('write failed ENOSPC\nBearer super-secret-token'),
      'staging'
    )
    expect(message).toContain('SPACE_INSUFFICIENT:')
    expect(message).toContain('Destination impact: staged temporary data only')
    expect(message).toContain('Next action:')
    expect(message).not.toContain('super-secret-token')
    expect(message).not.toContain('\n')
  })

  it('directs interrupted operations back to recovery before another mutation', () => {
    expect(publicMigrationError(new Error('migration recovery is required before starting another operation')))
      .toMatch(/^RECOVERY_REQUIRED:.*Open Data migration/)
  })
})
