export const MAX_NAME_LENGTH = 30;
const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export enum NameValidationResult {
    Valid,
    Empty,
    TooLong,
}
export function validateName(name: string): [NameValidationResult, string] {
    const trimmedName = escapeRegex(name.trim());
    if (trimmedName.length > MAX_NAME_LENGTH) {
        return [NameValidationResult.TooLong, ''];
    }
    if (trimmedName.length == 0) {
        return [NameValidationResult.Empty, ''];
    }
    return [NameValidationResult.Valid, trimmedName];
}
