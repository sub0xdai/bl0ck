/**
 * Type declarations for @elizaos/server internal message bus
 * The server package doesn't generate .d.ts files, so we declare the types we need
 */
declare module '@elizaos/server' {
    interface InternalMessageBus {
        emit(event: string, data: unknown): boolean;
        on(event: string, handler: (data: unknown) => void): this;
        off(event: string, handler: (data: unknown) => void): void;
    }

    export const internalMessageBus: InternalMessageBus;
}
