"use client";

import { UAParser } from "ua-parser-js";
import { api } from "~/trpc/react";
import { Separator } from "@usesend/ui/src/separator";
import { EmailStatusBadge, EmailStatusIcon } from "./email-status-badge";
import { formatDate } from "date-fns";
import { motion } from "framer-motion";
import { EmailStatus } from "@prisma/client";
import { JsonValue } from "@prisma/client/runtime/library";
import {
  SesBounce,
  SesClick,
  SesComplaint,
  SesDeliveryDelay,
  SesOpen,
} from "~/types/aws-types";
import {
  BOUNCE_ERROR_MESSAGES,
  COMPLAINT_ERROR_MESSAGES,
  DELIVERY_DELAY_ERRORS,
} from "~/lib/constants/ses-errors";
import CancelEmail from "./cancel-email";
import { useEffect } from "react";
import { useState } from "react";
import { extractEmailAddress } from "~/utils/email";

export default function EmailDetails({ emailId }: { emailId: string }) {
  // Note: emailId is actually a recipientId now, keeping the prop name for backward compatibility
  const recipientQuery = api.email.getRecipient.useQuery({ recipientId: emailId });

  return (
    <div className="h-full overflow-auto px-4 no-scrollbar">
      <div className="flex justify-between items-center">
        <div className="flex gap-4 items-center">
          <h1 className="font-bold">{extractEmailAddress(recipientQuery.data?.email || "")}</h1>
          <EmailStatusBadge status={recipientQuery.data?.latestStatus ?? "SENT"} />
        </div>
      </div>
      <div className="flex flex-col mt-8 items-start gap-8">
        <div className="p-4 rounded-lg border flex flex-col gap-3 w-full shadow">
          <div className="font-medium text-lg mb-2">Email Headers</div>

          <div className="flex gap-2">
            <span className="w-[80px] text-muted-foreground text-sm font-medium">From:</span>
            <span className="text-sm">{recipientQuery.data?.parentEmail?.from || ""}</span>
          </div>
          <Separator />

          <div className="flex gap-2">
            <span className="w-[80px] text-muted-foreground text-sm font-medium">To:</span>
            <span className="text-sm">{recipientQuery.data?.parentEmail?.to?.join(", ") || ""}</span>
          </div>
          <Separator />

          {recipientQuery.data?.parentEmail?.cc && recipientQuery.data?.parentEmail?.cc.length > 0 && (
            <>
              <div className="flex gap-2">
                <span className="w-[80px] text-muted-foreground text-sm font-medium">CC:</span>
                <span className="text-sm">{recipientQuery.data.parentEmail.cc.join(", ")}</span>
              </div>
              <Separator />
            </>
          )}

          {recipientQuery.data?.parentEmail?.bcc && recipientQuery.data?.parentEmail?.bcc.length > 0 && (
            <>
              <div className="flex gap-2">
                <span className="w-[80px] text-muted-foreground text-sm font-medium">BCC:</span>
                <span className="text-sm">{recipientQuery.data.parentEmail.bcc.join(", ")}</span>
              </div>
              <Separator />
            </>
          )}

          <div className="flex gap-2">
            <span className="w-[80px] text-muted-foreground text-sm font-medium">Subject:</span>
            <span className="text-sm">{recipientQuery.data?.parentEmail?.subject}</span>
          </div>
          <Separator />

          <div className="flex gap-2">
            <span className="w-[80px] text-muted-foreground text-sm font-medium">Date:</span>
            <span className="text-sm">
              {recipientQuery.data?.parentEmail?.createdAt ?
                formatDate(recipientQuery.data.parentEmail.createdAt, "MMM dd, yyyy 'at' hh:mm a") :
                "--"
              }
            </span>
          </div>

          {/* Attachments Section */}
          {recipientQuery.data?.parentEmail?.attachments && (
            <div className="mt-4">
              <div className="font-medium mb-2">Attachments</div>
              <AttachmentsList
                emailId={recipientQuery.data.parentEmail.id}
                attachments={JSON.parse(recipientQuery.data.parentEmail.attachments)}
              />
            </div>
          )}

          <div className="mt-4">
            <div className="font-medium mb-2">This Recipient</div>
            <div className="flex gap-2">
              <span className="w-[80px] text-muted-foreground text-sm font-medium">Address:</span>
              <span className="text-sm">{extractEmailAddress(recipientQuery.data?.email || "")}</span>
            </div>
          </div>

          {recipientQuery.data?.latestStatus === "SCHEDULED" &&
          recipientQuery.data?.parentEmail?.scheduledAt ? (
            <>
              <Separator />
              <div className="flex gap-2 items-center">
                <span className="w-[80px] text-muted-foreground text-sm font-medium">
                  Scheduled at:
                </span>
                <span className="text-sm">
                  {formatDate(
                    recipientQuery.data.parentEmail.scheduledAt,
                    "MMM dd'th', hh:mm a"
                  )}
                </span>
                <div className="ml-4">
                  <CancelEmail emailId={recipientQuery.data.parentEmail.id} />
                </div>
              </div>
            </>
          ) : null}

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: 0.3 }}
            className="mt-4"
          >
            <div className="font-medium mb-2">Email Content</div>
            <EmailPreview html={recipientQuery.data?.parentEmail?.html ?? ""} />
          </motion.div>
        </div>
        {recipientQuery.data?.latestStatus !== "SCHEDULED" ? (
          <div className="border rounded-lg w-full shadow mb-2">
            <div className="p-4 flex flex-col gap-8 w-full">
              <div className="font-medium">Event History for {extractEmailAddress(recipientQuery.data?.email || "")}</div>
              <div className="flex items-stretch px-4 w-full">
                <div className="border-r border-gray-300 dark:border-gray-700 border-dashed" />
                <div className="flex flex-col gap-12 w-full">
                  {recipientQuery.data?.events && recipientQuery.data.events.length > 0 ? (
                    recipientQuery.data.events.map((evt, index) => (
                      <div
                        key={`${evt.status}-${index}`}
                        className="flex gap-5 items-start w-full"
                      >
                        <div className="-ml-2.5">
                          <EmailStatusIcon status={evt.status} />
                        </div>
                        <div className="-mt-[0.125rem] w-full">
                          <div className="capitalize font-medium">
                            <EmailStatusBadge status={evt.status} />
                          </div>
                          <div className="text-xs text-muted-foreground mt-2">
                            {formatDate(evt.createdAt, "MMM dd, hh:mm a")}
                          </div>
                          <div className="mt-1 text-foreground/80">
                            <EmailStatusText
                              status={evt.status}
                              data={evt.data}
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-muted-foreground">No events recorded for this recipient yet.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const EmailPreview = ({ html }: { html: string }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShow(true);
    }, 200);

    return () => clearTimeout(timer);
  }, []);

  if (!show) {
    return (
      <div className="dark:bg-slate-200 h-[350px] overflow-visible rounded border-t"></div>
    );
  }

  return (
    <div className="dark:bg-slate-200 h-[350px] overflow-visible rounded border-t">
      <iframe
        className="w-full h-full"
        srcDoc={html}
        sandbox="allow-same-origin"
      />
    </div>
  );
};

const EmailStatusText = ({
  status,
  data,
}: {
  status: EmailStatus;
  data: JsonValue;
}) => {
  if (status === "SENT") {
    return (
      <div>
        We received your request and sent the email to recipient's server.
      </div>
    );
  } else if (status === "DELIVERED") {
    return <div>Mail is successfully delivered to the recipient.</div>;
  } else if (status === "DELIVERY_DELAYED") {
    const _errorData = data as unknown as SesDeliveryDelay;
    const errorMessage = DELIVERY_DELAY_ERRORS[_errorData.delayType];

    return <div>{errorMessage}</div>;
  } else if (status === "BOUNCED") {
    const _errorData = data as unknown as SesBounce;
    _errorData.bounceType;

    return (
      <div className="flex flex-col gap-4 w-full">
        <p>{getErrorMessage(_errorData)}</p>
        <div className="rounded-xl p-4 bg-muted/30 flex flex-col gap-4">
          <div className="flex gap-2 w-full">
            <div className="w-1/2">
              <p className="text-sm text-muted-foreground">Type</p>
              <p>{_errorData.bounceType}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Sub Type</p>
              <p>{_errorData.bounceSubType}</p>
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">SMTP response</p>
            <p>{_errorData.bouncedRecipients[0]?.diagnosticCode}</p>
          </div>
        </div>
      </div>
    );
  } else if (status === "FAILED") {
    const _errorData = data as unknown as { error: string };
    return <div>{_errorData.error}</div>;
  } else if (status === "OPENED") {
    const _data = data as unknown as SesOpen;
    const userAgent = getUserAgent(_data.userAgent);

    return (
      <div className="w-full rounded-xl p-4 bg-muted/30 mt-4">
        <div className="flex  w-full ">
          {userAgent.os.name ? (
            <div className="w-1/2">
              <p className="text-sm text-muted-foreground">OS</p>
              <p>{userAgent.os.name}</p>
            </div>
          ) : null}
          {userAgent.browser.name ? (
            <div>
              <p className="text-sm text-muted-foreground">Browser</p>
              <p>{userAgent.browser.name}</p>
            </div>
          ) : null}
        </div>
      </div>
    );
  } else if (status === "CLICKED") {
    const _data = data as unknown as SesClick;
    const userAgent = getUserAgent(_data.userAgent);

    return (
      <div className="w-full mt-4 flex flex-col gap-4  rounded-xl p-4 bg-muted/30">
        <div className="flex  w-full ">
          {userAgent.os.name ? (
            <div className="w-1/2">
              <p className="text-sm text-muted-foreground">OS </p>
              <p>{userAgent.os.name}</p>
            </div>
          ) : null}
          {userAgent.browser.name ? (
            <div>
              <p className="text-sm text-muted-foreground">Browser </p>
              <p>{userAgent.browser.name}</p>
            </div>
          ) : null}
        </div>
        <div className="w-full">
          <p className="text-sm text-muted-foreground">URL</p>
          <p>{_data.link}</p>
        </div>
      </div>
    );
  } else if (status === "COMPLAINED") {
    const _errorData = data as unknown as SesComplaint;

    return (
      <div className="flex flex-col gap-4 w-full">
        <p>{getComplaintMessage(_errorData.complaintFeedbackType)}</p>
      </div>
    );
  } else if (status === "CANCELLED") {
    return <div>This scheduled email was cancelled</div>;
  } else if (status === "SUPPRESSED") {
    return (
      <div>
        This email was suppressed because this email is previously either
        bounced or the recipient complained.
      </div>
    );
  }

  return <div className="w-full">{status}</div>;
};

const getErrorMessage = (data: SesBounce) => {
  if (data.bounceType === "Permanent") {
    return BOUNCE_ERROR_MESSAGES[data.bounceType][
      data.bounceSubType as
        | "General"
        | "NoEmail"
        | "Suppressed"
        | "OnAccountSuppressionList"
    ];
  } else if (data.bounceType === "Transient") {
    return BOUNCE_ERROR_MESSAGES[data.bounceType][
      data.bounceSubType as
        | "General"
        | "MailboxFull"
        | "MessageTooLarge"
        | "ContentRejected"
        | "AttachmentRejected"
    ];
  } else if (data.bounceType === "Undetermined") {
    return BOUNCE_ERROR_MESSAGES.Undetermined;
  }
};

const getComplaintMessage = (errorType: string) => {
  return COMPLAINT_ERROR_MESSAGES[
    errorType as keyof typeof COMPLAINT_ERROR_MESSAGES
  ];
};

const getUserAgent = (userAgent: string) => {
  const parser = new UAParser(userAgent);
  return {
    browser: parser.getBrowser(),
    os: parser.getOS(),
    device: parser.getDevice(),
  };
};

interface AttachmentsListProps {
  emailId: string;
  attachments: Array<{ filename: string; content: string }>;
}

function AttachmentsList({ emailId, attachments }: AttachmentsListProps) {
  const utils = api.useUtils();

  const downloadAttachment = async (index: number, filename: string) => {
    try {
      const data = await utils.email.downloadAttachment.fetch({
        emailId,
        attachmentIndex: index
      });

      // Convert base64 to blob and download
      const binaryString = atob(data.content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: data.contentType });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download attachment:', error);
    }
  };

  if (!attachments || attachments.length === 0) {
    return <div className="text-sm text-muted-foreground">No attachments</div>;
  }

  return (
    <div className="space-y-2">
      {attachments.map((attachment, index) => (
        <div
          key={index}
          className="flex items-center justify-between p-2 border rounded hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-100 rounded flex items-center justify-center">
              📎
            </div>
            <span className="text-sm font-medium">{attachment.filename}</span>
          </div>
          <button
            onClick={() => downloadAttachment(index, attachment.filename)}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Download
          </button>
        </div>
      ))}
    </div>
  );
}
