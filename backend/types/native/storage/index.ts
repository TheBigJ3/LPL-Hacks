export type StorageConfig = {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    publicBaseUrl?: string;
};

export type StoragePutOptions = {
    contentType?: string;
    cacheControl?: string;
    metadata?: Record<string, string>;
};

export type StorageObject = {
    key: string;
    body: Buffer;
    contentType?: string;
    contentLength?: number;
};

export type StorageListEntry = {
    key: string;
    size: number;
    lastModified?: Date;
};

export type StorageSignedUploadOptions = {
    contentType?: string;
    expiresInSeconds?: number;
};
