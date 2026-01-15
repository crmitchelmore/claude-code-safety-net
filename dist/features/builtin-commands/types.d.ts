export type BuiltinCommandName = 'set-custom-rules' | 'verify-custom-rules';
export interface CommandDefinition {
    description?: string;
    template: string;
}
export type BuiltinCommands = Record<string, CommandDefinition>;
