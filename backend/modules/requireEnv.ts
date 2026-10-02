import dotenv from 'dotenv'
import { ServerError } from './ServerError.js';
dotenv.config();

type EnvType = 'string' | 'number' | 'boolean'

type EnvReturn<T extends EnvType> =
    T extends 'number' ? number :
    T extends 'boolean' ? boolean :
    string

export default function requireEnv(key: string): string
export default function requireEnv<T extends EnvType>(key: string, type: T): EnvReturn<T>
export default function requireEnv<T extends EnvType>(key: string, type: T = 'string' as T): EnvReturn<T> {
    const value = process.env[key]
    if (value === undefined || value === '') {
        throw new ServerError(undefined, `[env] Environment variable ${key} not found!`)
    }

    switch (type) {
        case 'number': {
            const num = Number(value)
            if (Number.isNaN(num)) {
                throw new ServerError(undefined, `[env] Environment variable ${key} must be a number, got "${value}"`)
            }
            return num as EnvReturn<T>
        }
        case 'boolean': {
            if (value !== 'true' && value !== 'false') {
                throw new ServerError(undefined, `[env] Environment variable ${key} must be "true" or "false", got "${value}"`)
            }
            return (value === 'true') as EnvReturn<T>
        }
        default:
            return value as EnvReturn<T>
    }
}
