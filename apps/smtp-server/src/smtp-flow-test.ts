import nodemailer from 'nodemailer'
import * as fs from 'fs'
import * as path from 'path'
import dotenv from 'dotenv'

dotenv.config()

const SMTP_HOST = process.env.SMTP_HOST || 'localhost'
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587')
const SMTP_USERNAME = process.env.SMTP_AUTH_USERNAME || 'usesend'
const SMTP_API_KEY = process.env.USESEND_API_KEY
const DISABLE_SSL = process.env.DISABLE_SSL === "true" || process.env.NODE_ENV === "development"

const TEST_FROM_EMAIL = process.env.TEST_FROM_EMAIL || 'test@example.com'
const TEST_TO_EMAIL = process.env.TEST_TO_EMAIL || 'recipient@example.com'
const TEST_CC_EMAIL = process.env.TEST_CC_EMAIL || 'cc@example.com'
const TEST_BCC_EMAIL = process.env.TEST_BCC_EMAIL || 'bcc@example.com'

interface TestResult {
    testName: string
    success: boolean
    error?: string
    duration: number
}

function createTestAttachment() {
    const testContent = `This is a test attachment file.
Created for SMTP server testing.
Timestamp: ${new Date().toISOString()}
Random data: ${Math.random().toString(36).substring(7)}`

    return {
        filename: 'test-attachment.txt',
        content: Buffer.from(testContent, 'utf8'),
        contentType: 'text/plain'
    }
}

function createImageAttachment() {
    // Create a proper 32x32 pixel test pattern PNG image
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9aIFrgwAAAABJRU5ErkJggg=='

    return {
        filename: 'test-image.png',
        content: Buffer.from(pngBase64, 'base64'),
        contentType: 'image/png'
    }
}

function createCSVAttachment() {
    const csvContent = `Name,Email,Department,Salary
John Doe,john.doe@example.com,Engineering,75000
Jane Smith,jane.smith@example.com,Marketing,65000
Bob Johnson,bob.johnson@example.com,Sales,60000
Alice Brown,alice.brown@example.com,HR,55000
Test User,test@example.com,QA,70000`

    return {
        filename: 'employees.csv',
        content: Buffer.from(csvContent, 'utf8'),
        contentType: 'text/csv'
    }
}

function createJSONAttachment() {
    const jsonContent = {
        testResults: {
            timestamp: new Date().toISOString(),
            success: true,
            tests: [
                { name: "Authentication", status: "passed", duration: 120 },
                { name: "Email Processing", status: "passed", duration: 250 },
                { name: "Attachment Handling", status: "passed", duration: 180 }
            ],
            summary: {
                total: 3,
                passed: 3,
                failed: 0
            }
        }
    }

    return {
        filename: 'test-results.json',
        content: Buffer.from(JSON.stringify(jsonContent, null, 2), 'utf8'),
        contentType: 'application/json'
    }
}

function createSVGAttachment() {
    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="200" height="100" xmlns="http://www.w3.org/2000/svg">
    <rect width="200" height="100" fill="#4f46e5" rx="10"/>
    <text x="100" y="30" font-family="Arial, sans-serif" font-size="16" fill="white" text-anchor="middle">SMTP Test</text>
    <text x="100" y="50" font-family="Arial, sans-serif" font-size="12" fill="white" text-anchor="middle">Attachment Test</text>
    <circle cx="50" cy="70" r="8" fill="#10b981"/>
    <circle cx="100" cy="70" r="8" fill="#f59e0b"/>
    <circle cx="150" cy="70" r="8" fill="#ef4444"/>
    <text x="100" y="90" font-family="Arial, sans-serif" font-size="10" fill="white" text-anchor="middle">${new Date().toISOString()}</text>
</svg>`

    return {
        filename: 'test-graphic.svg',
        content: Buffer.from(svgContent, 'utf8'),
        contentType: 'image/svg+xml'
    }
}

function createLogAttachment() {
    const logContent = `[${new Date().toISOString()}] INFO: SMTP server started
[${new Date().toISOString()}] INFO: Listening on ports 25, 587, 2587
[${new Date().toISOString()}] DEBUG: SSL disabled for local testing
[${new Date().toISOString()}] INFO: Authentication successful for user: usesend
[${new Date().toISOString()}] INFO: Email received from: ${TEST_FROM_EMAIL}
[${new Date().toISOString()}] INFO: Email sent to: ${TEST_TO_EMAIL}
[${new Date().toISOString()}] DEBUG: Processing attachments: 5 files
[${new Date().toISOString()}] INFO: Email forwarded to useSend API successfully
[${new Date().toISOString()}] INFO: Response received: 200 OK
[${new Date().toISOString()}] INFO: SMTP transaction completed`

    return {
        filename: 'smtp-server.log',
        content: Buffer.from(logContent, 'utf8'),
        contentType: 'text/plain'
    }
}

async function createTransporter() {
    if (!SMTP_API_KEY) {
        throw new Error('USESEND_API_KEY environment variable is required')
    }

    console.log('🔑 Creating SMTP transporter with credentials:', {
        host: SMTP_HOST,
        port: SMTP_PORT,
        username: SMTP_USERNAME,
        apiKeyPresent: !!SMTP_API_KEY,
        apiKeyLength: SMTP_API_KEY?.length || 0
    });

    const transportConfig: any = {
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: false, // true for 465, false for other ports
        auth: {
            user: SMTP_USERNAME,
            pass: SMTP_API_KEY
        }
    }

    // Only add TLS configuration if SSL is not disabled
    if (!DISABLE_SSL) {
        transportConfig.tls = {
            rejectUnauthorized: false // Allow self-signed certificates for testing
        }
    } else {
        // Completely disable TLS for local testing
        transportConfig.ignoreTLS = true
        transportConfig.requireTLS = false
        transportConfig.secure = false
        console.log('TLS disabled for SMTP client (local testing mode)')
    }

    return nodemailer.createTransport(transportConfig)
}

async function runTest(testName: string, testFn: () => Promise<void>): Promise<TestResult> {
    const startTime = Date.now()
    console.log(`\n🧪 Running test: ${testName}`)

    try {
        await testFn()
        const duration = Date.now() - startTime
        console.log(`✅ ${testName} - SUCCESS (${duration}ms)`)
        return { testName, success: true, duration }
    } catch (error) {
        const duration = Date.now() - startTime
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.log(`❌ ${testName} - FAILED (${duration}ms): ${errorMessage}`)
        return { testName, success: false, error: errorMessage, duration }
    }
}

async function testPlainTextEmail(transporter: nodemailer.Transporter): Promise<void> {
    const mailOptions = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SMTP Test - Plain Text Email',
        text: `Hello from SMTP server test!

This is a plain text email to test the basic SMTP functionality.

Features being tested:
- Plain text content
- Basic SMTP relay
- Text-to-HTML conversion for tracking

Best regards,
SMTP Test Suite

Timestamp: ${new Date().toISOString()}`
    }

    const info = await transporter.sendMail(mailOptions)
    console.log(`   📧 Plain text email sent - Message ID: ${info.messageId}`)
}

async function testHtmlEmail(transporter: nodemailer.Transporter): Promise<void> {
    const mailOptions = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SMTP Test - HTML Email',
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
                        <h1>🚀 SMTP Server HTML Test</h1>
                    </div>
                    <div class="content">
                        <h2>Hello from the SMTP server!</h2>
                        <p>This is an <strong>HTML email</strong> sent through the SMTP server.</p>
                        <ul>
                            <li>✅ HTML formatting</li>
                            <li>✅ CSS styles</li>
                            <li>✅ SMTP relay</li>
                            <li>✅ Rich content</li>
                        </ul>
                        <p>Visit <a href="https://github.com/usesend/usesend">useSend on GitHub</a> for more information.</p>
                    </div>
                    <div class="footer">
                        <p>This email was sent via SMTP server test at ${new Date().toLocaleString()}</p>
                    </div>
                </body>
            </html>
        `,
        text: `Hello from the SMTP server!

This is the plain text version of the HTML email sent through SMTP.

Features tested:
- HTML formatting
- CSS styles
- SMTP relay
- Rich content

Best regards,
SMTP Test Suite`
    }

    const info = await transporter.sendMail(mailOptions)
    console.log(`   📧 HTML email sent - Message ID: ${info.messageId}`)
}

async function testEmailWithCC(transporter: nodemailer.Transporter): Promise<void> {
    const mailOptions = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        cc: TEST_CC_EMAIL,
        subject: 'SMTP Test - Email with CC',
        text: `Hello from SMTP server test!

This email is testing CC functionality.

Recipients:
- TO: ${TEST_TO_EMAIL}
- CC: ${TEST_CC_EMAIL}

This tests that the SMTP server correctly handles and forwards CC recipients.

Best regards,
SMTP Test Suite

Timestamp: ${new Date().toISOString()}`
    }

    const info = await transporter.sendMail(mailOptions)
    console.log(`   📧 Email with CC sent - Message ID: ${info.messageId}`)
}

async function testEmailWithBCC(transporter: nodemailer.Transporter): Promise<void> {
    const mailOptions = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        bcc: TEST_BCC_EMAIL,
        subject: 'SMTP Test - Email with BCC',
        text: `Hello from SMTP server test!

This email is testing BCC functionality.

Recipients:
- TO: ${TEST_TO_EMAIL}
- BCC: ${TEST_BCC_EMAIL} (hidden)

This tests that the SMTP server correctly handles and forwards BCC recipients.

Best regards,
SMTP Test Suite

Timestamp: ${new Date().toISOString()}`
    }

    const info = await transporter.sendMail(mailOptions)
    console.log(`   📧 Email with BCC sent - Message ID: ${info.messageId}`)
}

async function testEmailWithCCAndBCC(transporter: nodemailer.Transporter): Promise<void> {
    const mailOptions = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        cc: TEST_CC_EMAIL,
        bcc: TEST_BCC_EMAIL,
        subject: 'SMTP Test - Email with CC and BCC',
        html: `
            <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <h2>📧 SMTP Server CC & BCC Test</h2>
                    <p>This email is testing both CC and BCC functionality simultaneously.</p>

                    <h3>Recipients:</h3>
                    <ul>
                        <li><strong>TO:</strong> ${TEST_TO_EMAIL}</li>
                        <li><strong>CC:</strong> ${TEST_CC_EMAIL}</li>
                        <li><strong>BCC:</strong> ${TEST_BCC_EMAIL} (hidden)</li>
                    </ul>

                    <p>This tests that the SMTP server correctly handles and forwards multiple recipient types.</p>

                    <p><em>Best regards,<br>SMTP Test Suite</em></p>

                    <hr>
                    <small>Timestamp: ${new Date().toISOString()}</small>
                </body>
            </html>
        `,
        text: `SMTP Server CC & BCC Test

This email is testing both CC and BCC functionality simultaneously.

Recipients:
- TO: ${TEST_TO_EMAIL}
- CC: ${TEST_CC_EMAIL}
- BCC: ${TEST_BCC_EMAIL} (hidden)

This tests that the SMTP server correctly handles and forwards multiple recipient types.

Best regards,
SMTP Test Suite

Timestamp: ${new Date().toISOString()}`
    }

    const info = await transporter.sendMail(mailOptions)
    console.log(`   📧 Email with CC and BCC sent - Message ID: ${info.messageId}`)
}

async function testTextEmailWithAttachment(transporter: nodemailer.Transporter): Promise<void> {
    const attachment = createTestAttachment()

    const mailOptions = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SMTP Test - Plain Text with Attachment',
        text: `Hello from SMTP server test!

This is a plain text email with an attachment.

The attachment should be properly extracted and forwarded by the SMTP server.

Attachment details:
- Filename: ${attachment.filename}
- Type: ${attachment.contentType}

Best regards,
SMTP Test Suite

Timestamp: ${new Date().toISOString()}`,
        attachments: [attachment]
    }

    const info = await transporter.sendMail(mailOptions)
    console.log(`   📧 Plain text email with attachment sent - Message ID: ${info.messageId}`)
}

async function testHtmlEmailWithAttachment(transporter: nodemailer.Transporter): Promise<void> {
    const attachment = createTestAttachment()

    const mailOptions = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SMTP Test - HTML with Attachment',
        html: `
            <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .attachment-box {
                            background-color: #f0f9ff;
                            border: 1px solid #0ea5e9;
                            padding: 15px;
                            border-radius: 5px;
                            margin: 20px 0;
                        }
                    </style>
                </head>
                <body>
                    <h2>📎 SMTP Server Attachment Test</h2>
                    <p>This is an <strong>HTML email with an attachment</strong> sent through the SMTP server.</p>

                    <div class="attachment-box">
                        <h3>📂 Attachment Details</h3>
                        <ul>
                            <li><strong>Filename:</strong> ${attachment.filename}</li>
                            <li><strong>Type:</strong> ${attachment.contentType}</li>
                            <li><strong>Size:</strong> ${attachment.content.length} bytes</li>
                        </ul>
                    </div>

                    <p>The SMTP server should extract and forward this attachment correctly.</p>

                    <p><em>Best regards,<br>SMTP Test Suite</em></p>

                    <hr>
                    <small>Timestamp: ${new Date().toISOString()}</small>
                </body>
            </html>
        `,
        text: `SMTP Server Attachment Test

This is an HTML email with an attachment sent through the SMTP server.

Attachment Details:
- Filename: ${attachment.filename}
- Type: ${attachment.contentType}
- Size: ${attachment.content.length} bytes

The SMTP server should extract and forward this attachment correctly.

Best regards,
SMTP Test Suite

Timestamp: ${new Date().toISOString()}`,
        attachments: [attachment]
    }

    const info = await transporter.sendMail(mailOptions)
    console.log(`   📧 HTML email with attachment sent - Message ID: ${info.messageId}`)
}

async function testEmailWithMultipleAttachments(transporter: nodemailer.Transporter): Promise<void> {
    const textAttachment = createTestAttachment()
    const imageAttachment = createImageAttachment()
    const csvAttachment = createCSVAttachment()
    const jsonAttachment = createJSONAttachment()
    const svgAttachment = createSVGAttachment()
    const logAttachment = createLogAttachment()

    const allAttachments = [textAttachment, imageAttachment, csvAttachment, jsonAttachment, svgAttachment, logAttachment]

    const mailOptions = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        cc: TEST_CC_EMAIL,
        subject: 'SMTP Test - Multiple Diverse Attachments',
        html: `
            <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px; }
                        .attachment-list { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin: 15px 0; }
                        .attachment-item { margin: 8px 0; padding: 8px; background: white; border-radius: 4px; border-left: 4px solid #4f46e5; }
                        .stats { display: flex; justify-content: space-around; background: #ecfdf5; padding: 15px; border-radius: 8px; margin: 15px 0; }
                        .stat { text-align: center; }
                        .stat-number { font-size: 24px; font-weight: bold; color: #059669; }
                        .stat-label { font-size: 12px; color: #6b7280; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>📎 Comprehensive Attachment Test</h1>
                        <p>Testing ${allAttachments.length} different file types</p>
                    </div>

                    <h2>📋 Test Overview</h2>
                    <p>This email contains <strong>${allAttachments.length} different attachments</strong> to thoroughly test the SMTP server's attachment handling capabilities.</p>

                    <div class="stats">
                        <div class="stat">
                            <div class="stat-number">${allAttachments.length}</div>
                            <div class="stat-label">Total Files</div>
                        </div>
                        <div class="stat">
                            <div class="stat-number">${allAttachments.reduce((sum, att) => sum + att.content.length, 0)}</div>
                            <div class="stat-label">Total Bytes</div>
                        </div>
                        <div class="stat">
                            <div class="stat-number">${new Set(allAttachments.map(att => att.contentType.split('/')[0])).size}</div>
                            <div class="stat-label">File Categories</div>
                        </div>
                    </div>

                    <div class="attachment-list">
                        <h3>📁 Attached Files</h3>
                        ${allAttachments.map((att, index) => `
                            <div class="attachment-item">
                                <strong>${index + 1}. ${att.filename}</strong><br>
                                <small>Type: ${att.contentType} | Size: ${att.content.length} bytes</small>
                            </div>
                        `).join('')}
                    </div>

                    <h3>📧 Recipients</h3>
                    <ul>
                        <li><strong>TO:</strong> ${TEST_TO_EMAIL}</li>
                        <li><strong>CC:</strong> ${TEST_CC_EMAIL}</li>
                    </ul>

                    <h3>✅ Testing Capabilities</h3>
                    <ul>
                        <li>📄 Text files (.txt, .log)</li>
                        <li>📊 Data files (.csv, .json)</li>
                        <li>🖼️ Image files (.png, .svg)</li>
                        <li>📬 Multiple recipients (CC)</li>
                        <li>🎨 Rich HTML content</li>
                        <li>📎 Large attachment payload</li>
                    </ul>

                    <div style="margin-top: 30px; padding: 15px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                        <strong>⚠️ Important:</strong> All ${allAttachments.length} files should be successfully delivered and processed by the SMTP server.
                    </div>

                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #e2e8f0;">
                    <p style="text-align: center; color: #6b7280; font-size: 12px;">
                        <em>Generated by SMTP Test Suite<br>
                        ${new Date().toLocaleString()}</em>
                    </p>
                </body>
            </html>
        `,
        text: `Comprehensive Attachment Test

This email contains ${allAttachments.length} different attachments to thoroughly test the SMTP server's attachment handling capabilities.

ATTACHED FILES:
${allAttachments.map((att, index) => `${index + 1}. ${att.filename} (${att.contentType}) - ${att.content.length} bytes`).join('\n')}

RECIPIENTS:
- TO: ${TEST_TO_EMAIL}
- CC: ${TEST_CC_EMAIL}

TESTING CAPABILITIES:
- Text files (.txt, .log)
- Data files (.csv, .json)
- Image files (.png, .svg)
- Multiple recipients (CC)
- Large attachment payload

IMPORTANT: All ${allAttachments.length} files should be successfully delivered and processed by the SMTP server.

Generated by SMTP Test Suite
${new Date().toLocaleString()}`,
        attachments: allAttachments
    }

    const info = await transporter.sendMail(mailOptions)
    console.log(`   📧 Email with ${allAttachments.length} diverse attachments sent - Message ID: ${info.messageId}`)
    console.log(`   📊 Total attachment size: ${allAttachments.reduce((sum, att) => sum + att.content.length, 0)} bytes`)
}

async function runAllSMTPTests(): Promise<void> {
    console.log('🚀 Starting SMTP Flow Tests')
    console.log('============================')
    console.log('')
    console.log(`📍 SMTP Server: ${SMTP_HOST}:${SMTP_PORT}`)
    console.log(`🔑 Username: ${SMTP_USERNAME}`)
    console.log(`📧 Test emails will be sent from: ${TEST_FROM_EMAIL}`)
    console.log(`📧 Test emails will be sent to: ${TEST_TO_EMAIL}`)
    console.log(`📧 CC emails will be sent to: ${TEST_CC_EMAIL}`)
    console.log(`📧 BCC emails will be sent to: ${TEST_BCC_EMAIL}`)
    console.log('')

    if (!SMTP_API_KEY) {
        console.error('❌ USESEND_API_KEY environment variable is required.')
        console.log('   Set your API key: export USESEND_API_KEY=your-actual-api-key')
        console.log('')
        return
    }

    let transporter: nodemailer.Transporter
    try {
        transporter = await createTransporter()
        console.log('✅ SMTP connection established')
    } catch (error) {
        console.error('❌ Failed to create SMTP connection:', error)
        return
    }

    const tests = [
        // () => testPlainTextEmail(transporter),
        // () => testHtmlEmail(transporter),
        // () => testEmailWithCC(transporter),
        // () => testEmailWithBCC(transporter),
        // () => testEmailWithCCAndBCC(transporter),
        // () => testTextEmailWithAttachment(transporter),
        // () => testHtmlEmailWithAttachment(transporter),
        () => testEmailWithMultipleAttachments(transporter)
    ]

    const testNames = [
        // 'Plain Text Email',
        // 'HTML Email',
        // 'Email with CC',
        // 'Email with BCC',
        // 'Email with CC and BCC',
        // 'Text Email with Attachment',
        // 'HTML Email with Attachment',
        'Email with 6 Diverse Attachments'
    ]

    const results: TestResult[] = []

    for (let i = 0; i < tests.length; i++) {
        const result = await runTest(testNames[i], tests[i])
        results.push(result)

        // Wait between tests to avoid overwhelming the server
        if (i < tests.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000))
        }
    }

    // Summary
    console.log('\n📊 Test Summary')
    console.log('================')

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)

    console.log(`✅ Successful: ${successful}/${results.length}`)
    console.log(`❌ Failed: ${failed}/${results.length}`)
    console.log(`⏱️  Total duration: ${totalDuration}ms`)

    if (failed > 0) {
        console.log('\n❌ Failed Tests:')
        results.filter(r => !r.success).forEach(r => {
            console.log(`   • ${r.testName}: ${r.error}`)
        })
    }

    console.log('\n🎉 SMTP Flow Tests Completed!')
    console.log('============================')

    // Close the transporter
    transporter.close()
}

// Run the tests if this file is executed directly
if (require.main === module) {
    runAllSMTPTests().catch(console.error)
}

export { runAllSMTPTests }
