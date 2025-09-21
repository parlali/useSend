import * as fs from 'fs'
import * as path from 'path'
import dotenv from 'dotenv'

dotenv.config()

const BASE_URL =
    process.env.USESEND_BASE_URL ??
    "https://app.usesend.com"

const API_KEY = process.env.USESEND_API_KEY

const to = process.env.TEST_TO_EMAIL
const from = process.env.TEST_FROM_EMAIL

async function sendEmailToUseSend(emailData: any, apiKey: string) {
    try {
        const apiEndpoint = "/api/v1/emails"
        const url = new URL(apiEndpoint, BASE_URL)
        console.log("Sending email to useSend API at:", url.href)

        const emailDataText = JSON.stringify(emailData)

        const response = await fetch(url.href, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: emailDataText,
        })

        if (!response.ok) {
            const errorData = await response.text()
            console.error(
                "useSend API error response: error:",
                JSON.stringify(errorData, null, 4),
                `\nemail data: ${emailDataText}`,
            )
            throw new Error(
                `Failed to send email: ${errorData || "Unknown error from server"}`,
            )
        }

        const responseData = await response.json()
        console.log("useSend API response:", responseData)
        return responseData
    } catch (error) {
        if (error instanceof Error) {
            console.error("Error message:", error.message)
            throw new Error(`Failed to send email: ${error.message}`)
        } else {
            console.error("Unexpected error:", error)
            throw new Error("Failed to send email: Unexpected error occurred")
        }
    }
}

function createTestAttachment(): { filename: string; content: string } {
    const testContent = 'This is a test attachment file.\nCreated for SMTP server testing.\nTimestamp: ' + new Date().toISOString()
    const base64Content = Buffer.from(testContent, 'utf8').toString('base64')

    return {
        filename: 'test-attachment.txt',
        content: base64Content
    }
}

async function sendPlainTextEmail() {
    console.log('📧 Sending plain text email...')

    if (!API_KEY) {
        console.error('❌ API key not found. Please set USESEND_API_KEY environment variable.')
        return
    }

    try {
        const emailData = {
            to,
            from,
            subject: 'Test Email - Plain Text',
            text: 'Hello from the SMTP server test!\n\nThis is a plain text email to test the basic email functionality.\n\nBest regards,\nSMTP Test Suite'
        }

        const response = await sendEmailToUseSend(emailData, API_KEY)
        console.log('✅ Plain text email sent successfully:', response)
    } catch (error) {
        console.error('❌ Error sending plain text email:', error)
    }
}

async function sendHtmlEmail() {
    console.log('📧 Sending HTML email...')

    if (!API_KEY) {
        console.error('❌ API key not found. Please set USESEND_API_KEY environment variable.')
        return
    }

    try {
        const emailData = {
            to,
            from,
            subject: 'Test Email - HTML',
            html: `
                <html>
                    <head>
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .header { background-color: #4f46e5; color: white; padding: 20px; text-align: center; }
                            .content { padding: 20px; }
                            .footer { background-color: #f3f4f6; padding: 10px; text-align: center; font-size: 12px; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <h1>🚀 SMTP Server Test</h1>
                        </div>
                        <div class="content">
                            <h2>Hello from the SMTP server!</h2>
                            <p>This is an <strong>HTML email</strong> to test the email formatting capabilities.</p>
                            <ul>
                                <li>✅ HTML formatting</li>
                                <li>✅ CSS styles</li>
                                <li>✅ Rich content</li>
                            </ul>
                            <p>Visit <a href="https://github.com/usesend/usesend">useSend on GitHub</a> for more information.</p>
                        </div>
                        <div class="footer">
                            <p>This email was sent via SMTP server test suite at ${new Date().toLocaleString()}</p>
                        </div>
                    </body>
                </html>
            `,
            text: 'Hello from the SMTP server test!\n\nThis is the plain text version of the HTML email.\n\nBest regards,\nSMTP Test Suite'
        }

        const response = await sendEmailToUseSend(emailData, API_KEY)
        console.log('✅ HTML email sent successfully:', response)
    } catch (error) {
        console.error('❌ Error sending HTML email:', error)
    }
}

async function sendPlainTextWithAttachment() {
    console.log('📧 Sending plain text email with attachment...')

    if (!API_KEY) {
        console.error('❌ API key not found. Please set USESEND_API_KEY environment variable.')
        return
    }

    try {
        const attachment = createTestAttachment()

        const emailData = {
            to,
            from,
            subject: 'Test Email - Plain Text with Attachment',
            text: 'Hello from the SMTP server test!\n\nThis is a plain text email with an attachment.\n\nPlease find the test file attached.\n\nBest regards,\nSMTP Test Suite',
            attachments: [attachment]
        }

        const response = await sendEmailToUseSend(emailData, API_KEY)
        console.log('✅ Plain text email with attachment sent successfully:', response)
    } catch (error) {
        console.error('❌ Error sending plain text email with attachment:', error)
    }
}

async function sendHtmlWithAttachment() {
    console.log('📧 Sending HTML email with attachment...')

    if (!API_KEY) {
        console.error('❌ API key not found. Please set USESEND_API_KEY environment variable.')
        return
    }

    try {
        const attachment = createTestAttachment()

        const emailData = {
            to,
            from,
            subject: 'Test Email - HTML with Attachment',
            html: `
                <html>
                    <head>
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .header { background-color: #059669; color: white; padding: 20px; text-align: center; }
                            .content { padding: 20px; }
                            .attachment-info {
                                background-color: #f0f9ff;
                                border: 1px solid #0ea5e9;
                                padding: 15px;
                                border-radius: 5px;
                                margin: 20px 0;
                            }
                            .footer { background-color: #f3f4f6; padding: 10px; text-align: center; font-size: 12px; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <h1>📎 SMTP Server Test with Attachment</h1>
                        </div>
                        <div class="content">
                            <h2>Hello from the SMTP server!</h2>
                            <p>This is an <strong>HTML email with an attachment</strong> to test the complete email functionality.</p>

                            <div class="attachment-info">
                                <h3>📂 Attachment Included</h3>
                                <p>This email includes a test text file attachment to verify that file attachments work correctly.</p>
                            </div>

                            <h3>Test Features:</h3>
                            <ul>
                                <li>✅ HTML formatting</li>
                                <li>✅ CSS styles</li>
                                <li>✅ File attachment</li>
                                <li>✅ Rich content</li>
                            </ul>

                            <p><em>Thank you for testing the SMTP server!</em></p>
                        </div>
                        <div class="footer">
                            <p>This email was sent via SMTP server test suite at ${new Date().toLocaleString()}</p>
                        </div>
                    </body>
                </html>
            `,
            text: 'Hello from the SMTP server test!\n\nThis is an HTML email with an attachment.\n\nPlease find the test file attached.\n\nTest Features:\n- HTML formatting\n- CSS styles\n- File attachment\n- Rich content\n\nBest regards,\nSMTP Test Suite',
            attachments: [attachment]
        }

        const response = await sendEmailToUseSend(emailData, API_KEY)
        console.log('✅ HTML email with attachment sent successfully:', response)
    } catch (error) {
        console.error('❌ Error sending HTML email with attachment:', error)
    }
}

async function runAllTests() {
    console.log('🚀 Starting SMTP Server Email Tests')
    console.log('=====================================')

    if (!API_KEY) {
        console.error('❌ API key not found. Please set USESEND_API_KEY environment variable.')
        console.log('   Set your API key: export USESEND_API_KEY=your-actual-api-key')
        console.log('')
        return
    }

    console.log(`📍 Sending emails to: ${BASE_URL}`)
    console.log('📋 Running 4 email tests:')
    console.log('1. Plain text email')
    console.log('2. HTML email')
    console.log('3. Plain text with attachment')
    console.log('4. HTML with attachment')
    console.log('')

    // Run tests sequentially with a small delay between them
    await sendPlainTextEmail()
    await new Promise(resolve => setTimeout(resolve, 1000))

    await sendHtmlEmail()
    await new Promise(resolve => setTimeout(resolve, 1000))

    await sendPlainTextWithAttachment()
    await new Promise(resolve => setTimeout(resolve, 1000))

    await sendHtmlWithAttachment()

    console.log('')
    console.log('🎉 All email tests completed!')
    console.log('=====================================')
}

// Run the tests if this file is executed directly
if (require.main === module) {
    runAllTests().catch(console.error)
}

export { runAllTests, sendPlainTextEmail, sendHtmlEmail, sendPlainTextWithAttachment, sendHtmlWithAttachment }
