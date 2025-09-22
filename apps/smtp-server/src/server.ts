import { SMTPServer, SMTPServerOptions, SMTPServerSession } from "smtp-server";
import { Readable } from "stream";
import dotenv from "dotenv";
import { simpleParser } from "mailparser";
import { readFileSync, watch, FSWatcher } from "fs";

dotenv.config();

const AUTH_USERNAME = process.env.SMTP_AUTH_USERNAME ?? "usesend";
const BASE_URL =
  process.env.USESEND_BASE_URL ??
  process.env.UNSEND_BASE_URL ??
  "https://app.usesend.com";
const SSL_KEY_PATH =
  process.env.USESEND_API_KEY_PATH ?? process.env.UNSEND_API_KEY_PATH;
const SSL_CERT_PATH =
  process.env.USESEND_API_CERT_PATH ?? process.env.UNSEND_API_CERT_PATH;
const DISABLE_SSL = process.env.DISABLE_SSL === "true" || process.env.NODE_ENV === "development";

console.log("🚀 Starting SMTP Server with config:", {
  AUTH_USERNAME,
  DISABLE_SSL,
  SSL_KEY_PATH: !!SSL_KEY_PATH,
  SSL_CERT_PATH: !!SSL_CERT_PATH,
  BASE_URL
});

async function sendEmailToUseSend(emailData: any, apiKey: string) {
  try {
    const apiEndpoint = "/api/v1/emails";
    const url = new URL(apiEndpoint, BASE_URL); // Combine base URL with endpoint
    console.log("Sending email to useSend API at:", url.href); // Debug statement

    const emailDataText = JSON.stringify(emailData);

    const response = await fetch(url.href, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: emailDataText,
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(
        "useSend API error response: error:",
        JSON.stringify(errorData, null, 4),
        `\nemail data: ${emailDataText}`,
      );
      throw new Error(
        `Failed to send email: ${errorData || "Unknown error from server"}`,
      );
    }

    const responseData = await response.json();
    console.log("useSend API response:", responseData);
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      throw new Error(`Failed to send email: ${error.message}`);
    } else {
      console.error("Unexpected error:", error);
      throw new Error("Failed to send email: Unexpected error occurred");
    }
  }
}

function loadCertificates(): { key?: Buffer; cert?: Buffer } {
  if (DISABLE_SSL) {
    console.log("SSL disabled for local testing")
    return { key: undefined, cert: undefined }
  }
  return {
    key: SSL_KEY_PATH ? readFileSync(SSL_KEY_PATH) : undefined,
    cert: SSL_CERT_PATH ? readFileSync(SSL_CERT_PATH) : undefined,
  };
}

const initialCerts = loadCertificates();

// Shared handlers for both SSL and non-SSL servers
const emailDataHandler = (
  stream: Readable,
  session: SMTPServerSession,
  callback: (error?: Error) => void,
) => {
  console.log("Receiving email data..."); // Debug statement
  simpleParser(stream, (err, parsed) => {
    if (err) {
      console.error("Failed to parse email data:", err.message);
      return callback(err);
    }

    if (!session.user) {
      console.error("No API key found in session");
      return callback(new Error("No API key found in session"));
    }

    // Helper function to extract email addresses
    const extractEmails = (addressList: any) => {
      if (!addressList) return undefined
      if (Array.isArray(addressList)) {
        return addressList.map((addr) => addr.text).join(", ")
      }
      return addressList.text
    }

    // Extract attachments if present
    const attachments = parsed.attachments?.map((attachment) => ({
      filename: attachment.filename || 'attachment',
      content: attachment.content?.toString('base64') || '',
      contentType: attachment.contentType || 'application/octet-stream',
      size: attachment.size
    }))

    // Handle different body content scenarios
    let htmlContent = parsed.html
    if (!htmlContent && parsed.text) {
      // If only plain text is provided, wrap it in minimal HTML for tracking
      htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px;">
    <div style="white-space: pre-wrap;">${parsed.text.replace(/\n/g, '<br>')}</div>
</body>
</html>`
    } else if (!htmlContent && !parsed.text) {
      // If neither HTML nor text is provided, send blank HTML to satisfy API requirements
      htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px;">
    <div></div>
</body>
</html>`
    }

    const emailObject = {
      to: extractEmails(parsed.to),
      from: extractEmails(parsed.from),
      cc: extractEmails(parsed.cc),
      bcc: extractEmails(parsed.bcc),
      subject: parsed.subject || "(No Subject)",
      text: parsed.text,
      html: htmlContent,
      replyTo: extractEmails(parsed.replyTo),
      ...(attachments && attachments.length > 0 && { attachments })
    }

    sendEmailToUseSend(emailObject, session.user)
      .then(() => {
        console.log("Email sent successfully to: ", emailObject.to)
        callback()
      })
      .catch((error) => {
        console.error("Failed to send email:", error.message)
        callback(error)
      })
  });
}

const authHandler = (auth: any, session: any, callback: (error?: Error, user?: any) => void) => {
  // Allow plain text auth when SSL is disabled
  if (DISABLE_SSL) {
    console.log("Plain text authentication (SSL disabled)")
  }

  console.log("🔐 Auth attempt:", {
    username: auth.username,
    passwordPresent: !!auth.password,
    expectedUsername: AUTH_USERNAME,
    method: auth.method
  });

  if (auth.username === AUTH_USERNAME && auth.password) {
    console.log("✅ Authenticated successfully");
    callback(undefined, { user: auth.password }); // Pass the API key in user object
  } else {
    console.error("❌ Invalid username or password");
    console.error("Expected username:", AUTH_USERNAME, "Got:", auth.username);
    console.error("Password present:", !!auth.password);
    callback(new Error("Invalid username or password"));
  }
}

// SSL-enabled server configuration
const sslServerOptions: SMTPServerOptions = {
  secure: false,
  key: initialCerts.key,
  cert: initialCerts.cert,
  allowInsecureAuth: false,
  onData: emailDataHandler,
  onAuth: authHandler,
  size: 10485760,
}

// Plain server configuration (no TLS at all)
const plainServerOptions: SMTPServerOptions = {
  secure: false,
  allowInsecureAuth: true,
  hideSTARTTLS: true,
  onData: emailDataHandler,
  onAuth: authHandler,
  size: 10485760,
};

function startServers() {
  const servers: SMTPServer[] = [];
  const watchers: FSWatcher[] = [];

  if (!DISABLE_SSL && SSL_KEY_PATH && SSL_CERT_PATH) {
    // Implicit SSL/TLS for ports 465 and 2465
    [465, 2465].forEach((port) => {
      const server = new SMTPServer({ ...sslServerOptions, secure: true });

      server.listen(port, () => {
        console.log(
          `Implicit SSL/TLS SMTP server is listening on port ${port}`,
        );
      });

      server.on("error", (err) => {
        console.error(`Error occurred on port ${port}:`, err);
      });

      servers.push(server);
    });
  } else if (DISABLE_SSL) {
    console.log("Skipping SSL/TLS servers (SSL disabled)")
  }

  // STARTTLS/Plain for ports 25, 587, and 2587
  [25, 587, 2587].forEach((port) => {
    const serverConfig = DISABLE_SSL ? plainServerOptions : sslServerOptions
    const server = new SMTPServer(serverConfig);

    server.listen(port, () => {
      const serverType = DISABLE_SSL ? "Plain SMTP" : "STARTTLS SMTP"
      console.log(`${serverType} server is listening on port ${port}`);
    });

    server.on("error", (err) => {
      console.error(`Error occurred on port ${port}:`, err);
    });

    servers.push(server);
  });

  if (!DISABLE_SSL && SSL_KEY_PATH && SSL_CERT_PATH) {
    const reloadCertificates = () => {
      try {
        const { key, cert } = loadCertificates();
        if (key && cert) {
          servers.forEach((srv) => srv.updateSecureContext({ key, cert }));
          console.log("TLS certificates reloaded");
        }
      } catch (err) {
        console.error("Failed to reload TLS certificates", err);
      }
    };

    [SSL_KEY_PATH, SSL_CERT_PATH].forEach((file) => {
      watchers.push(watch(file, { persistent: false }, reloadCertificates));
    });
  }
  return { servers, watchers };
}

const { servers, watchers } = startServers();

function shutdown() {
  console.log("Shutting down SMTP server...");
  watchers.forEach((w) => w.close());
  servers.forEach((s) => s.close());
  process.exit(0);
}

["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) => {
  process.on(signal, shutdown);
});
