import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'

// Ensure the data directory exists.
const dataDir = path.join(process.cwd(), 'data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const db = new Database(path.join(dataDir, 'pulse.db'))

// Enable Write-Ahead Logging for better concurrency and performance.
db.pragma('journal_mode = WAL')

/**
 * A generic transaction wrapper for atomicity.
 * @param {Function} fn - The function to execute inside the transaction.
 * @returns The result of the function.
 */
const asTransaction = (fn) => db.transaction(fn)

/**
 * Non-destructively adds a new column to a table if it doesn't already exist.
 * @param {string} tableName - The name of the table to alter.
 * @param {string} columnName - The name of the column to add.
 * @param {string} columnDefinition - The SQL definition for the new column.
 */
function addColumnIfNotExists (tableName, columnName, columnDefinition) {
  const columns = db.pragma(`table_info(${tableName})`)
  if (!columns.some(col => col.name === columnName)) {
    console.log(`Schema migration: Adding column '${columnName}' to table '${tableName}'...`)
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`)
  }
}

// --- Prepared Statements for Performance ---
// Declare queries object in the module scope. It will be populated by setup().
let queries = {}

/**
 * Creates the necessary database tables and indexes and runs migrations.
 */
function setup () {
  db.exec(`
    CREATE TABLE IF NOT EXISTS checks (
                                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                                        uuid TEXT NOT NULL UNIQUE,
                                        name TEXT NOT NULL,
                                        schedule TEXT NOT NULL,
                                        grace TEXT NOT NULL,
                                        status TEXT NOT NULL DEFAULT 'new', -- 'new', 'up', 'down', 'failed', 'maintenance'
                                        last_ping_at INTEGER,
                                        last_ping_duration_ms INTEGER,
                                        consecutive_down_count INTEGER NOT NULL DEFAULT 0,
                                        created_at INTEGER NOT NULL
    );
    -- Index to speed up the scheduler's query for active checks.
    CREATE INDEX IF NOT EXISTS idx_checks_status ON checks (status);
    -- Index to speed up lookups by UUID.
    CREATE INDEX IF NOT EXISTS idx_checks_uuid ON checks (uuid);
  `)

  // --- Non-destructive migrations ---
  addColumnIfNotExists('checks', 'last_error', 'TEXT')

  // --- Populate the queries object AFTER tables are guaranteed to exist ---
  queries = {
    getAll: db.prepare('SELECT * FROM checks ORDER BY name ASC LIMIT ? OFFSET ?'),
    getTotal: db.prepare('SELECT COUNT(*) as total FROM checks'),
    getAllUnpaginated: db.prepare('SELECT * FROM checks'),
    getAllActive: db.prepare("SELECT * FROM checks WHERE status != 'maintenance'"),
    getByUuid: db.prepare('SELECT * FROM checks WHERE uuid = ?'),
    getById: db.prepare('SELECT * FROM checks WHERE id = ?'),
    create: db.prepare('INSERT INTO checks (uuid, name, schedule, grace, created_at) VALUES (@uuid, @name, @schedule, @grace, @createdAt)'),
    delete: db.prepare('DELETE FROM checks WHERE uuid = ?'),
    recordPing: db.prepare("UPDATE checks SET status = 'up', last_ping_at = ?, last_ping_duration_ms = ?, consecutive_down_count = 0, last_error = NULL WHERE uuid = ?"),
    recordFailure: db.prepare("UPDATE checks SET status = 'failed', last_ping_at = ?, last_error = ?, consecutive_down_count = 0 WHERE uuid = ?"),
    setDown: db.prepare("UPDATE checks SET status = 'down', consecutive_down_count = consecutive_down_count + 1 WHERE id = ?"),
    setStatus: db.prepare('UPDATE checks SET status = ? WHERE uuid = ?')
  }

  console.log('Database initialized successfully.')
}

/** Retrieves a paginated list of checks from the database. */
function getAllChecks ({ page = 1, limit = 20 }) {
  const offset = (page - 1) * limit
  const checks = queries.getAll.all(limit, offset)
  const { total } = queries.getTotal.get()

  return {
    checks,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  }
}

/** Retrieves all checks without pagination, for internal use. */
function getAllChecksUnpaginated ({ activeOnly = false } = {}) {
  return activeOnly ? queries.getAllActive.all() : queries.getAllUnpaginated.all()
}

/** Retrieves a single check by its UUID. */
function getCheckByUuid (uuid) {
  return queries.getByUuid.get(uuid)
}

/** Creates a new check. */
const createCheck = asTransaction(({ name, schedule, grace }) => {
  const newCheck = {
    uuid: uuidv4(),
    name,
    schedule,
    grace,
    createdAt: Math.floor(Date.now() / 1000)
  }
  const info = queries.create.run(newCheck)
  return queries.getById.get(info.lastInsertRowid)
})

/** Deletes a check by its UUID. */
function deleteCheck (uuid) {
  return queries.delete.run(uuid).changes
}

/** Records a successful ping for a check. */
/** FIX: Prevents pings from changing the status of a check in maintenance mode. */
const recordPing = asTransaction((uuid, duration) => {
  const check = getCheckByUuid(uuid)
  if (!check) {
    return null // Check not found
  }
  if (check.status === 'maintenance') {
    // Ignore pings for checks in maintenance to prevent state corruption.
    return check
  }
  const result = queries.recordPing.run(Math.floor(Date.now() / 1000), duration, uuid)
  return result.changes > 0 ? getCheckByUuid(uuid) : null
})

/** Records an explicit failure for a check. */
const recordFailure = asTransaction((uuid, reason) => {
  const result = queries.recordFailure.run(Math.floor(Date.now() / 1000), reason, uuid)
  return result.changes > 0 ? getCheckByUuid(uuid) : null
})

/** Marks a check as 'down'. */
const setCheckDown = asTransaction((id) => {
  const result = queries.setDown.run(id)
  return result.changes > 0 ? queries.getById.get(id) : null
})

/** Toggles maintenance mode for a check. */
const toggleMaintenance = asTransaction((uuid) => {
  const check = getCheckByUuid(uuid)
  if (!check) return null
  const newStatus = check.status === 'maintenance' ? (check.last_ping_at ? 'up' : 'new') : 'maintenance'
  queries.setStatus.run(newStatus, uuid)
  return getCheckByUuid(uuid)
})

export const data = {
  setup,
  getAllChecks,
  getAllChecksUnpaginated,
  getCheckByUuid,
  createCheck,
  deleteCheck,
  recordPing,
  recordFailure,
  setCheckDown,
  toggleMaintenance
}
