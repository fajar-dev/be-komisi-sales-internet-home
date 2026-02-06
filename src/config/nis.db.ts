import { createPool, type Pool } from 'mysql2/promise'
import {
    NIS_DB_HOST,
    NIS_DB_NAME,
    NIS_DB_PASSWORD,
    NIS_DB_POOL,
    NIS_DB_PORT,
    NIS_DB_USER,
} from './config'

export const nisPool: Pool = createPool({
    host: NIS_DB_HOST,
    port: Number(NIS_DB_PORT),
    user: NIS_DB_USER,
    password: NIS_DB_PASSWORD,
    database: NIS_DB_NAME,
    connectionLimit: Number(NIS_DB_POOL),
    waitForConnections: true,
    queueLimit: 0,
})