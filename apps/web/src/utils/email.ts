/**
 * Extracts clean email address from various formats:
 * - "John Doe <john@example.com>" -> "john@example.com"
 * - "john@example.com" -> "john@example.com"
 * - "'John Doe' <john@example.com>" -> "john@example.com"
 */
export function extractEmailAddress(emailString: string): string {
    if (!emailString) return ""

    // Handle the <email> format
    const match = emailString.match(/<([^>]+)>/)
    if (match?.[1]) {
        return match[1].trim()
    }

    // Already a clean email address
    return emailString.trim()
}

/**
 * Extracts clean email addresses from an array of email strings
 */
export function extractEmailAddresses(emails: string[]): string[] {
    return emails.map(extractEmailAddress).filter(Boolean)
}

/**
 * Formats email addresses by extracting clean emails and joining with separator
 */
export function formatEmailList(emails: string[], separator: string = ", "): string {
    return extractEmailAddresses(emails).join(separator)
}
