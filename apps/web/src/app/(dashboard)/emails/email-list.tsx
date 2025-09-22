"use client";

import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@usesend/ui/src/table";
import { api } from "~/trpc/react";
import { Download } from "lucide-react";
import { formatDate } from "date-fns";
import { EmailStatus } from "@prisma/client";
import { EmailStatusBadge } from "./email-status-badge";
import EmailDetails from "./email-details";
import dynamic from "next/dynamic";
import { useUrlState } from "~/hooks/useUrlState";
import { Button } from "@usesend/ui/src/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@usesend/ui/src/select";
import Spinner from "@usesend/ui/src/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@usesend/ui/src/tooltip";
import { Input } from "@usesend/ui/src/input";
import { DEFAULT_QUERY_LIMIT } from "~/lib/constants";
import { useDebouncedCallback } from "use-debounce";
import { SheetTitle, SheetDescription } from "@usesend/ui/src/sheet";
import { extractEmailAddress } from "~/utils/email";
// Using HTML checkbox since @usesend/ui doesn't have Checkbox component
import { Trash2 } from "lucide-react";
import { useState } from "react";

/* Stupid hydrating error. And I so stupid to understand the stupid NextJS docs */
const DynamicSheetWithNoSSR = dynamic(
  () => import("@usesend/ui/src/sheet").then((mod) => mod.Sheet),
  { ssr: false },
);

const DynamicSheetContentWithNoSSR = dynamic(
  () => import("@usesend/ui/src/sheet").then((mod) => mod.SheetContent),
  { ssr: false },
);

export default function EmailsList() {
  const [selectedRecipient, setSelectedRecipient] = useUrlState("recipientId");
  const [page, setPage] = useUrlState("page", "1");
  const [status, setStatus] = useUrlState("status");
  const [search, setSearch] = useUrlState("search");
  const [domain, setDomain] = useUrlState("domain");
  const [apiKey, setApiKey] = useUrlState("apikey");
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());

  const pageNumber = Number(page);
  const domainId = domain ? Number(domain) : undefined;
  const apiId = apiKey ? Number(apiKey) : undefined;

  const recipientsQuery = api.email.emails.useQuery({
    page: pageNumber,
    status: status?.toUpperCase() as EmailStatus,
    domain: domainId,
    search,
    apiId: apiId,
  });

  const exportQuery = api.email.exportEmails.useQuery(
    {
      status: status?.toUpperCase() as EmailStatus,
      domain: domainId,
      search,
      apiId: apiId,
    },
    { enabled: false },
  );

  const deleteRecipientsMutation = api.email.deleteRecipients.useMutation({
    onSuccess: () => {
      // Clear selection and refetch data
      setSelectedRecipients(new Set());
      recipientsQuery.refetch();
    },
  });

  const { data: domainsQuery } = api.domain.domains.useQuery();
  const { data: apiKeysQuery } = api.apiKey.getApiKeys.useQuery();

  const handleSelectRecipient = (recipientId: string) => {
    setSelectedRecipient(recipientId);
  };

  const handleDomain = (val: string) => {
    setDomain(val === "All Domains" ? null : val);
  };

  const handleApiKey = (val: string) => {
    setApiKey(val === "All API Keys" ? null : val);
  };

  const handleSheetChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedRecipient(null);
    }
  };

  const handleSelectRecipientCheckbox = (recipientId: string, checked: boolean) => {
    const newSelected = new Set(selectedRecipients);
    if (checked) {
      newSelected.add(recipientId);
    } else {
      newSelected.delete(recipientId);
    }
    setSelectedRecipients(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && recipientsQuery.data?.recipients) {
      const allIds = new Set(recipientsQuery.data.recipients.map(r => r.id));
      setSelectedRecipients(allIds);
    } else {
      setSelectedRecipients(new Set());
    }
  };

  const handleDeleteSelected = () => {
    if (selectedRecipients.size > 0) {
      deleteRecipientsMutation.mutate({
        recipientIds: Array.from(selectedRecipients)
      });
    }
  };

  const isAllSelected = (recipientsQuery.data?.recipients?.length ?? 0) > 0 &&
    selectedRecipients.size === (recipientsQuery.data?.recipients?.length ?? 0);
  const isSomeSelected = selectedRecipients.size > 0;

  const debouncedSearch = useDebouncedCallback((value: string) => {
    setSearch(value);
  }, 1000);

  const handleExport = async () => {
    try {
      const resp = await exportQuery.refetch();
      if (!resp.data) return;

      const escape = (val: unknown) => {
        const s = String(val ?? "");
        const startsRisky = /^\s*[=+\-@]/.test(s);
        const safe = (startsRisky ? "'" : "") + s.replace(/"/g, '""');
        return /[",\r\n]/.test(safe) ? `"${safe}"` : safe;
      };

      const header = [
        "Sender",
        "Recipient",
        "Status",
        "Subject",
        "Sent At",
        "Bounce Type",
        "Bounce Subtype",
        "Bounce Reason",
      ].join(",");
      const rows = resp.data.map((e) =>
        [
          extractEmailAddress(e.sender),
          extractEmailAddress(e.recipient),
          e.status,
          e.subject,
          e.sentAt,
          e.bounceType,
          e.bounceSubType,
          e.bounceReason,
        ]
          .map(escape)
          .join(","),
      );
      const csv = [header, ...rows].join("\n");

      const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `emails-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed", err);
    }
  };

  return (
    <div className="mt-10 flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <Input
          placeholder="Search by subject, sender, or recipient"
          className="w-[350px] mr-4"
          defaultValue={search ?? ""}
          onChange={(e) => debouncedSearch(e.target.value)}
        />
        <div className="flex justify-center items-center gap-x-3">
          <Select
            value={apiKey ?? "All API Keys"}
            onValueChange={(val) => handleApiKey(val)}
          >
            <SelectTrigger className="w-[180px]">
              {apiKey
                ? apiKeysQuery?.find((apikey) => apikey.id === Number(apiKey))
                    ?.name
                : "All API Keys"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All API Keys">All API Keys</SelectItem>
              {apiKeysQuery &&
                apiKeysQuery.map((apikey) => (
                  <SelectItem key={apikey.id} value={apikey.id.toString()}>
                    {apikey.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select
            value={domain ?? "All Domains"}
            onValueChange={(val) => handleDomain(val)}
          >
            <SelectTrigger className="w-[180px]">
              {domain
                ? domainsQuery?.find((d) => d.id === Number(domain))?.name
                : "All Domains"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All Domains" className=" capitalize">
                All Domains
              </SelectItem>
              {domainsQuery &&
                domainsQuery.map((domain) => (
                  <SelectItem key={domain.id} value={domain.id.toString()}>
                    {domain.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select
            value={status ?? "All statuses"}
            onValueChange={(val) =>
              setStatus(val === "All statuses" ? null : val)
            }
          >
            <SelectTrigger className="w-[180px] capitalize">
              {status ? status.toLowerCase().replace("_", " ") : "All statuses"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All statuses" className=" capitalize">
                All statuses
              </SelectItem>
              {Object.values([
                "SENT",
                "SCHEDULED",
                "QUEUED",
                "DELIVERED",
                "BOUNCED",
                "CLICKED",
                "OPENED",
                "DELIVERY_DELAYED",
                "COMPLAINED",
                "SUPPRESSED",
              ]).map((status) => (
                <SelectItem key={status} value={status} className=" capitalize">
                  {status.toLowerCase().replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exportQuery.isFetching}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          {isSomeSelected && (
            <Button
              variant="destructive"
              onClick={handleDeleteSelected}
              disabled={deleteRecipientsMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete ({selectedRecipients.size})
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-col rounded-xl border shadow">
        <Table className="">
          <TableHeader className="">
            <TableRow className=" bg-muted dark:bg-muted/70">
              <TableHead className="rounded-tl-xl w-12">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  aria-label="Select all"
                  className="h-4 w-4"
                />
              </TableHead>
              <TableHead>Sender</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead className="text-right rounded-tr-xl">
                Sent at
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipientsQuery.isLoading ? (
              <TableRow className="h-32">
                <TableCell colSpan={6} className="text-center py-4">
                  <Spinner
                    className="w-6 h-6 mx-auto"
                    innerSvgClass="stroke-primary"
                  />
                </TableCell>
              </TableRow>
            ) : recipientsQuery.data?.recipients.length ? (
              recipientsQuery.data?.recipients.map((recipient) => (
                <TableRow
                  key={recipient.id}
                  className=" cursor-pointer"
                >
                  <TableCell className="w-12">
                    <input
                      type="checkbox"
                      checked={selectedRecipients.has(recipient.id)}
                      onChange={(e) =>
                        handleSelectRecipientCheckbox(recipient.id, e.target.checked)
                      }
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select recipient ${recipient.email}`}
                      className="h-4 w-4"
                    />
                  </TableCell>
                  <TableCell
                    className="font-medium cursor-pointer"
                    onClick={() => handleSelectRecipient(recipient.id)}
                  >
                    <div className="flex gap-4 items-center">
                      <p>{extractEmailAddress(recipient.from)}</p>
                    </div>
                  </TableCell>
                  <TableCell
                    className="font-medium cursor-pointer"
                    onClick={() => handleSelectRecipient(recipient.id)}
                  >
                    <div className="flex gap-4 items-center">
                      <p>{extractEmailAddress(recipient.email)}</p>
                    </div>
                  </TableCell>
                  <TableCell
                    className="cursor-pointer"
                    onClick={() => handleSelectRecipient(recipient.id)}
                  >
                    {recipient.latestStatus === "SCHEDULED" && recipient.scheduledAt ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <EmailStatusBadge
                              status={recipient.latestStatus ?? "Sent"}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            Scheduled at{" "}
                            {formatDate(
                              recipient.scheduledAt,
                              "MMM dd'th', hh:mm a",
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <EmailStatusBadge status={recipient.latestStatus ?? "Sent"} />
                    )}
                  </TableCell>
                  <TableCell
                    className="cursor-pointer"
                    onClick={() => handleSelectRecipient(recipient.id)}
                  >
                    <div className=" max-w-xs truncate">{recipient.subject}</div>
                  </TableCell>
                  <TableCell
                    className="text-right cursor-pointer"
                    onClick={() => handleSelectRecipient(recipient.id)}
                  >
                    {recipient.latestStatus !== "SCHEDULED"
                      ? formatDate(
                          recipient.scheduledAt ?? recipient.createdAt,
                          "MMM do, hh:mm a",
                        )
                      : "--"}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="h-32">
                <TableCell colSpan={6} className="text-center py-4">
                  No recipients found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <DynamicSheetWithNoSSR
          open={!!selectedRecipient}
          onOpenChange={handleSheetChange}
        >
          <DynamicSheetContentWithNoSSR className="sm:max-w-3xl overflow-y-auto no-scrollbar">
            <SheetTitle className="sr-only">Recipient Details</SheetTitle>
            <SheetDescription className="sr-only">
              Detailed view of the selected recipient.
            </SheetDescription>
            {selectedRecipient ? <EmailDetails emailId={selectedRecipient} /> : null}
          </DynamicSheetContentWithNoSSR>
        </DynamicSheetWithNoSSR>
      </div>
      <div className="flex gap-4 justify-end">
        <Button
          size="sm"
          onClick={() => setPage((pageNumber - 1).toString())}
          disabled={pageNumber === 1}
        >
          Previous
        </Button>
        <Button
          size="sm"
          onClick={() => setPage((pageNumber + 1).toString())}
          disabled={recipientsQuery.data?.recipients.length !== DEFAULT_QUERY_LIMIT}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

