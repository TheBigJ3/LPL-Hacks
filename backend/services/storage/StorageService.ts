import {
    DeleteObjectCommand,
    DeleteObjectsCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "stream";
import { AppError } from "../../modules/AppError.js";
import { ServerError } from "../../modules/ServerError.js";
import { ERROR_TYPE } from "../../types/native/errors.js";
import { STORAGE_ERRORS } from "../../types/native/storage/errors.js";
import {
    StorageConfig,
    StorageListEntry,
    StorageObject,
    StoragePutOptions,
    StorageSignedUploadOptions,
} from "../../types/native/storage/index.js";

const SIGNED_URL_DEFAULT_SECONDS = 60 * 5;
const SIGNED_URL_MAX_SECONDS = 60 * 60 * 24 * 7;
const LIST_MAX_KEYS = 1000;
const DELETE_BATCH_SIZE = 1000;

export class StorageService {
    private readonly client: S3Client;
    private readonly bucket: string;
    private readonly publicBaseUrl?: string;

    constructor(config: StorageConfig) {
        this.client = new S3Client({
            region: "auto",
            endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
        });
        this.bucket = config.bucket;
        this.publicBaseUrl = config.publicBaseUrl?.replace(/\/+$/, "");
    }

    async put(key: string, body: Buffer | Uint8Array | string, options: StoragePutOptions = {}): Promise<string> {
        try {
            await this.client.send(
                new PutObjectCommand({
                    Bucket: this.bucket,
                    Key: key,
                    Body: body,
                    ContentType: options.contentType,
                    CacheControl: options.cacheControl,
                    Metadata: options.metadata,
                })
            );
        } catch (error) {
            throw this.upstreamFailure(STORAGE_ERRORS.UPLOAD_FAILED, key, error);
        }

        return key;
    }

    async putStream(key: string, body: Readable, contentLength: number, options: StoragePutOptions = {}): Promise<string> {
        try {
            await this.client.send(
                new PutObjectCommand({
                    Bucket: this.bucket,
                    Key: key,
                    Body: body,
                    ContentLength: contentLength,
                    ContentType: options.contentType,
                    CacheControl: options.cacheControl,
                    Metadata: options.metadata,
                })
            );
        } catch (error) {
            throw this.upstreamFailure(STORAGE_ERRORS.UPLOAD_FAILED, key, error);
        }

        return key;
    }

    async get(key: string): Promise<StorageObject> {
        try {
            const response = await this.client.send(
                new GetObjectCommand({ Bucket: this.bucket, Key: key })
            );

            if (!response.Body) {
                throw new AppError(STORAGE_ERRORS.OBJECT_NOT_FOUND);
            }

            return {
                key,
                body: Buffer.from(await response.Body.transformToByteArray()),
                contentType: response.ContentType,
                contentLength: response.ContentLength,
            };
        } catch (error) {
            if (error instanceof AppError) throw error;
            if (this.isNotFound(error)) throw new AppError(STORAGE_ERRORS.OBJECT_NOT_FOUND);
            throw this.upstreamFailure(STORAGE_ERRORS.DOWNLOAD_FAILED, key, error);
        }
    }

    async exists(key: string): Promise<boolean> {
        try {
            await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
            return true;
        } catch (error) {
            if (this.isNotFound(error)) return false;
            throw this.upstreamFailure(STORAGE_ERRORS.DOWNLOAD_FAILED, key, error);
        }
    }

    async delete(key: string): Promise<void> {
        try {
            await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
        } catch (error) {
            throw this.upstreamFailure(STORAGE_ERRORS.DELETE_FAILED, key, error);
        }
    }

    async deleteMany(keys: string[]): Promise<void> {
        if (keys.length === 0) return;

        for (let index = 0; index < keys.length; index += DELETE_BATCH_SIZE) {
            const batch = keys.slice(index, index + DELETE_BATCH_SIZE);

            try {
                const response = await this.client.send(
                    new DeleteObjectsCommand({
                        Bucket: this.bucket,
                        Delete: { Objects: batch.map((key) => ({ Key: key })), Quiet: true },
                    })
                );

                if (response.Errors && response.Errors.length > 0) {
                    throw new Error(
                        response.Errors.map((entry) => `${entry.Key}: ${entry.Message}`).join(", ")
                    );
                }
            } catch (error) {
                throw this.upstreamFailure(STORAGE_ERRORS.DELETE_FAILED, batch.join(", "), error);
            }
        }
    }

    async list(prefix: string, limit: number = LIST_MAX_KEYS): Promise<StorageListEntry[]> {
        const entries: StorageListEntry[] = [];
        let continuationToken: string | undefined;

        try {
            do {
                const response = await this.client.send(
                    new ListObjectsV2Command({
                        Bucket: this.bucket,
                        Prefix: prefix,
                        ContinuationToken: continuationToken,
                        MaxKeys: Math.min(limit - entries.length, LIST_MAX_KEYS),
                    })
                );

                for (const object of response.Contents ?? []) {
                    if (!object.Key) continue;
                    entries.push({
                        key: object.Key,
                        size: object.Size ?? 0,
                        lastModified: object.LastModified,
                    });
                }

                continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
            } while (continuationToken && entries.length < limit);
        } catch (error) {
            throw this.upstreamFailure(STORAGE_ERRORS.LIST_FAILED, prefix, error);
        }

        return entries.slice(0, limit);
    }

    async signedUploadUrl(key: string, options: StorageSignedUploadOptions = {}): Promise<string> {
        try {
            return await getSignedUrl(
                this.client,
                new PutObjectCommand({
                    Bucket: this.bucket,
                    Key: key,
                    ContentType: options.contentType,
                }),
                { expiresIn: this.expiresIn(options.expiresInSeconds) }
            );
        } catch (error) {
            throw this.upstreamFailure(STORAGE_ERRORS.SIGNED_URL_FAILED, key, error);
        }
    }

    async signedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string> {
        try {
            return await getSignedUrl(
                this.client,
                new GetObjectCommand({ Bucket: this.bucket, Key: key }),
                { expiresIn: this.expiresIn(expiresInSeconds) }
            );
        } catch (error) {
            throw this.upstreamFailure(STORAGE_ERRORS.SIGNED_URL_FAILED, key, error);
        }
    }

    publicUrl(key: string): string {
        if (!this.publicBaseUrl) {
            throw new ServerError(
                STORAGE_ERRORS.BUCKET_NOT_PUBLIC.MESSAGE,
                `[storage] publicUrl called on private bucket ${this.bucket} for key ${key}`
            );
        }

        return `${this.publicBaseUrl}/${encodeURI(key)}`;
    }

    private expiresIn(seconds?: number): number {
        return Math.min(seconds ?? SIGNED_URL_DEFAULT_SECONDS, SIGNED_URL_MAX_SECONDS);
    }

    private isNotFound(error: unknown): boolean {
        const upstream = error as { name?: string; $metadata?: { httpStatusCode?: number } };
        return (
            upstream?.name === "NoSuchKey" ||
            upstream?.name === "NotFound" ||
            upstream?.$metadata?.httpStatusCode === 404
        );
    }

    private upstreamFailure(error: ERROR_TYPE, key: string, cause: unknown): ServerError {
        const detail = cause instanceof Error ? cause.message : String(cause);
        return new ServerError(
            error.MESSAGE,
            `[storage] ${error.STATUS} on ${this.bucket}/${key}: ${detail}`
        );
    }
}
