export class ServerError extends Error {
    public _message?: string | undefined;
    public _servermessage: string | undefined;

    constructor(
      clientMessage?: string, serverMessage?: string
    ) {
        if (!clientMessage) {
            clientMessage = "INTERNAL SERVER ERROR"
        }
        super(clientMessage)
        this._servermessage = serverMessage || clientMessage

        this._message = clientMessage
        
    }
}
