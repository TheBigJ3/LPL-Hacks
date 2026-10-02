export type SocketEvent<Payload> = {
    readonly name: string;
    readonly payloadType?: Payload;
};

export type AnySocketEvent = SocketEvent<any>;

export type SocketPayloadOf<E extends AnySocketEvent> = E extends SocketEvent<infer Payload> ? Payload : never;

export function defineSocketEvent<Payload>() {
    return (name: string): SocketEvent<Payload> => ({ name });
}
