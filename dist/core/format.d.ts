type RedactFn = (text: string) => string;
export interface FormatBlockedMessageInput {
    reason: string;
    command?: string;
    segment?: string;
    maxLen?: number;
    redact?: RedactFn;
}
export declare function formatBlockedMessage(input: FormatBlockedMessageInput): string;
export {};
